# AGENTS.md

Guidance for AI coding agents working in this repo. `CLAUDE.md` points here, so this is the single source of truth.

## What this is

Solar Roof Scanner: an MVP for a solar company's lead generation. A user uploads aerial screenshots (e.g. from Google Earth), presses **Scan**, and gets a table of homes, which have rooftop solar, and the addresses readable in the image. The scanning engine is Claude's vision for now; a locally hosted model is expected later.

Owner: Chemicular Labs (small-business software and AI consulting). The owner is not a senior engineer and wants to be able to explain design decisions to clients, so prefer simple, readable code and say *why* when a choice is non-obvious.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build; run before committing
```

There is no test suite yet. Verify changes with `typecheck`, `build`, and by running the app with `SCAN_DETECTOR=mock` (fake results, no API key, no cost).

## Layout

- `app/page.tsx`: the whole UI (upload, scan, results table, CSV, box overlay). Client component.
- `app/api/scan/route.ts`: validates one uploaded image and calls the detector.
- `lib/detector/index.ts`: the `SolarDetector` interface and `getDetector()` selector (`SCAN_DETECTOR` env var).
- `lib/detector/claude.ts`: the Claude detector. Holds the system prompt and the response schema (Zod).
- `lib/detector/mock.ts`: fake detector for UI work.
- `lib/types.ts`: types shared by server and browser.

## Rules that matter

- **Keep the detector boundary.** The route and UI must not know which engine runs. A new engine (e.g. a local model) implements `SolarDetector` and is registered in `index.ts`; do not special-case it elsewhere.
- **Never invent addresses.** An address may only come from labels readable in the image. If the image has none, the result is `unknown` with null fields. Do not add logic or prompt wording that encourages guessing: wrong addresses send sales reps to the wrong door.
- **Accuracy over recall.** Prefer a `low` confidence flag to a confident wrong answer.
- **Secrets.** `ANTHROPIC_API_KEY` lives in `.env.local` (gitignored). Never commit keys or log image data.
- **No persistence yet.** Results live in browser state only. Don't add a database without being asked.

## Claude API usage

- Use the official `@anthropic-ai/sdk`. Default model is `claude-opus-5-5`, overridable via `SCAN_MODEL`.
- The response is constrained with `zodOutputFormat` so it is always valid JSON in the expected shape. If you change the schema, update `lib/types.ts`, the mapping in `claude.ts`, and the UI together.
- Thinking is always on for this model; control cost and depth with `output_config.effort`, not a thinking budget. Don't send `temperature`/`top_p`/`top_k`, and don't use forced `tool_choice`.
- `fallbacks: "default"` is on so a declined request retries on another model. Always check `stop_reason` (`refusal`, `max_tokens`) before using the output.
- Images: the browser downsizes to at most 2576px on the long edge so model coordinates map 1:1 to image pixels.

## Imagery and legal

Google's terms restrict scraping or building datasets from Google Earth/Maps imagery. Manually taken screenshots are fine for a prototype. Do not add automated tile fetching from Google. A production version should use public (NAIP) or licensed (Nearmap, EagleView, Vexcel) imagery. Outbound calls/texts to leads fall under TCPA and Do-Not-Call rules.

## Status and next steps

Detection accuracy is unmeasured. Likely next work: an accuracy eval on labelled images, geocoding via image map coordinates plus parcel data instead of relying on visible labels, saving scans/leads, and a local model behind the detector interface.

## Conventions

- TypeScript strict, Next.js App Router, plain CSS in `app/globals.css`.
- Commit messages: short imperative summary, then a body explaining why.
