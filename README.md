# Solar Roof Scanner (MVP)

Upload aerial screenshots of a neighborhood, press **Scan**, and get a table of
the homes found, which ones have rooftop solar, and the addresses that could be
read from the image. Results can be downloaded as a CSV.

## Requirements

- Node.js 20 or newer
- An Anthropic API key (only for real scans; the mock detector needs none)

## Run it

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

To try the interface without an API key or any cost, set `SCAN_DETECTOR=mock`
in `.env.local`. The mock returns placeholder homes, not a real scan.

## How it works

1. **Browser** (`app/page.tsx`): shrinks each image to at most 2576px on its
   long edge and uploads it, one image per request.
2. **API route** (`app/api/scan/route.ts`): validates the upload and passes it
   to the configured detector.
3. **Detector** (`lib/detector/`): returns every home in the image with a
   bounding box, a solar yes/no, a confidence level, and an address.
   - `claude.ts` sends the image to Claude and requires the answer in a fixed
     JSON shape.
   - `mock.ts` returns fake data for UI work.
   - `index.ts` defines the `SolarDetector` interface. A locally hosted model
     later only needs to implement `scan()` and be registered there.

## Where addresses come from

The scanner can only report an address it can **read in the image**: street
name labels and house numbers. It is instructed not to guess. If a screenshot
has no labels, the homes are still found and boxed, but the address column
says "No address visible".

For best results, turn on street and address labels before taking the
screenshot, and zoom in until individual roofs are clear. The optional location
field (city, state, ZIP) is appended to each address.

## Project docs

- `AGENTS.md`: instructions for AI coding agents (architecture, rules, commands). `CLAUDE.md` imports it.

## Known limits

- Accuracy has not been measured yet. Check a sample by eye before giving a
  list to sales reps.
- One image is scanned in one pass. A screenshot covering a very large area
  should be cropped into smaller ones.
- Nothing is saved. Results are lost when the page is refreshed, apart from
  the CSV download.
- Google's terms restrict automated use of Google Earth/Maps imagery. Manual
  screenshots are fine for proving the idea; a production version should use
  licensed or public imagery (see the feasibility notes).

## Likely next steps

- Turn boxes into addresses without relying on labels: have the user give the
  image's map coordinates, then look up each home against parcel data.
- Save scans and leads to a database.
- Measure accuracy on a labelled set of images.
- Swap in a locally hosted detection model behind the same interface.
