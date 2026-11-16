// Shared between the server (detectors, API route) and the browser (page).

export type Confidence = "high" | "medium" | "low";

/** How the detector came up with a home's address. */
export type AddressSource =
  | "visible_label" // house number and street were both readable in the image
  | "inferred" // worked out from nearby labels (e.g. numbering along a street)
  | "unknown"; // nothing in the image to go on

/** One home found in an image. Box is in pixels of the image that was scanned. */
export interface DetectedHome {
  box: { x: number; y: number; width: number; height: number };
  hasSolar: boolean;
  confidence: Confidence;
  notes: string;
  houseNumber: string | null;
  street: string | null;
  addressSource: AddressSource;
}

export interface ScanResult {
  homes: DetectedHome[];
  /** Street names the detector could read anywhere in the image. */
  visibleStreets: string[];
  summary: string;
  /** Which detector produced this, e.g. "claude:claude-opus-5-5" or "mock". */
  detector: string;
}

export interface ScanInput {
  image: Buffer;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  /** Free text from the user, e.g. "Chandler, AZ 85249". May be empty. */
  locationHint: string;
}
