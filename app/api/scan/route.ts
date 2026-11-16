import { NextResponse } from "next/server";
import { getDetector } from "@/lib/detector";
import type { ScanInput } from "@/lib/types";

export const runtime = "nodejs";
// A scan of a dense image can take a couple of minutes.
export const maxDuration = 300;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 8 * 1024 * 1024;

/** POST one image (multipart form) and get back the homes found in it. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const file = form.get("image");
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  const locationHint = String(form.get("locationHint") ?? "").trim().slice(0, 200);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image was uploaded." }, { status: 400 });
  }
  const mediaType = ALLOWED_TYPES.find((t) => t === file.type);
  if (!mediaType) {
    return NextResponse.json({ error: "Image must be a JPEG, PNG, or WebP." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is larger than 8 MB." }, { status: 413 });
  }
  if (!(width > 0 && height > 0)) {
    return NextResponse.json({ error: "Image dimensions are missing." }, { status: 400 });
  }

  const input: ScanInput = {
    image: Buffer.from(await file.arrayBuffer()),
    mediaType,
    width,
    height,
    locationHint,
  };

  try {
    const result = await getDetector().scan(input);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed.";
    console.error("Scan failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
