import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ScanInput, ScanResult } from "@/lib/types";
import type { SolarDetector } from "./index";

const MODEL = process.env.SCAN_MODEL ?? "claude-opus-5-5";

// The shape Claude must answer in. The API enforces this schema, so the
// response is always valid JSON with exactly these fields.
const ScanSchema = z.object({
  summary: z
    .string()
    .describe("One or two sentences: what the image shows and anything that limited the scan."),
  visible_streets: z
    .array(z.string())
    .describe("Every street name readable in the image, spelled exactly as labelled."),
  homes: z.array(
    z.object({
      x: z.number().describe("Left edge of the home's roof, in image pixels."),
      y: z.number().describe("Top edge of the home's roof, in image pixels."),
      width: z.number().describe("Width of the roof's bounding box, in image pixels."),
      height: z.number().describe("Height of the roof's bounding box, in image pixels."),
      has_solar: z.boolean(),
      confidence: z
        .enum(["high", "medium", "low"])
        .describe("Confidence in the has_solar value for this home."),
      notes: z
        .string()
        .describe("Short evidence for the call, e.g. 'two arrays, ~18 panels, south and west faces'."),
      house_number: z.string().nullable(),
      street: z.string().nullable(),
      address_source: z.enum(["visible_label", "inferred", "unknown"]),
    }),
  ),
});

const SYSTEM_PROMPT = `You analyze aerial and satellite images of residential neighborhoods for a company whose sales team looks for homes that already have rooftop solar. Each image is a screenshot a person saved from a mapping tool, so it may include map labels, UI chrome, or watermarks.

Your results become a lead list that sales reps act on, so a wrong address or a false "has solar" sends someone to the wrong door. Being accurate matters more than being complete.

Finding homes
- Report every distinct residential building you can see, whether or not it has solar. Skip sheds, detached garages, and commercial buildings.
- Give each home's bounding box around its roof, in pixels of the image as provided. The image dimensions are stated in the request.

Judging solar
- Photovoltaic panels show as dark blue or black rectangles in a regular grid, usually aligned to the roof edges, often with thin lighter lines between panels.
- Things that look similar but are not PV: skylights (single, glassy, often off-grid), solar pool heaters (matte black mats, no grid lines, usually near a pool), dark or shaded roof sections, roof vents, and trampolines or pool covers in the yard.
- Use "high" only when the panel grid is unmistakable. Use "low" when the image is too blurry or the roof too shaded to be sure either way, and say why in the notes.

Addresses
- The image itself is the only source for addresses. Read house numbers and street names from labels visible in the image.
- "visible_label": both the house number and the street are readable for this home.
- "inferred": you worked it out from nearby labels, such as a numbering pattern along a labelled street. Say what you inferred from in the notes.
- "unknown": the image gives nothing to go on. Leave house_number and street null rather than guessing. A street name alone, without a number, is still worth reporting.
- The user may supply the general location (city, state, ZIP). Use it as context only. Do not use it to make up house numbers or street names.`;

function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Anthropic rate limit reached. Wait a minute and scan again.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Anthropic API. Check the network connection.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Anthropic API error (${err.status ?? "unknown status"}): ${err.message}`;
  }
  return err instanceof Error ? err.message : "Unknown error while scanning.";
}

export const claudeDetector: SolarDetector = {
  name: `claude:${MODEL}`,

  async scan(input: ScanInput): Promise<ScanResult> {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error(
        "No Anthropic API key configured. Add ANTHROPIC_API_KEY to .env.local, or set SCAN_DETECTOR=mock to try the UI with fake results.",
      );
    }
    const client = new Anthropic();

    const request = [
      `Image size: ${input.width} x ${input.height} pixels.`,
      input.locationHint
        ? `General location supplied by the user: ${input.locationHint}`
        : "The user did not supply a general location.",
      "Scan this image and report every home.",
    ].join("\n");

    let response;
    try {
      // Streaming is required here: the SDK refuses a non-streaming request
      // whose max_tokens could take over 10 minutes. The result is the same
      // parsed message either way; we just wait for the stream to finish.
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        // If the model declines a request, the API retries it on a fallback
        // model inside the same call instead of failing the scan.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high", format: zodOutputFormat(ScanSchema) },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: input.mediaType,
                  data: input.image.toString("base64"),
                },
              },
              { type: "text", text: request },
            ],
          },
        ],
      });
      response = await stream.finalMessage();
    } catch (err) {
      // If the answer is cut off by max_tokens, the half-finished JSON fails to
      // parse and the SDK throws a plain (non-API) error before we can read
      // stop_reason. Treat that case as "too many homes".
      if (!(err instanceof Anthropic.APIError) && /json|parse|unexpected/i.test(String(err))) {
        throw new Error(
          "This image has too many homes to report in one pass. Crop it into smaller areas and scan those.",
        );
      }
      throw new Error(describeApiError(err));
    }

    if (response.stop_reason === "refusal") {
      throw new Error("The model declined to analyze this image.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error(
        "This image has too many homes to report in one pass. Crop it into smaller areas and scan those.",
      );
    }
    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error("The model's answer could not be read. Try scanning again.");
    }

    return {
      summary: parsed.summary,
      visibleStreets: parsed.visible_streets,
      detector: `claude:${response.model}`,
      homes: parsed.homes.map((h) => ({
        box: { x: h.x, y: h.y, width: h.width, height: h.height },
        hasSolar: h.has_solar,
        confidence: h.confidence,
        notes: h.notes,
        houseNumber: h.house_number,
        street: h.street,
        addressSource: h.address_source,
      })),
    };
  },
};
