import type { ScanInput, ScanResult } from "@/lib/types";
import { claudeDetector } from "./claude";
import { mockDetector } from "./mock";

/**
 * A detector takes one aerial image and returns the homes it found.
 *
 * This interface is the seam for swapping the engine later: a locally hosted
 * vision model only has to implement `scan` and be registered below. Nothing
 * in the API route or the UI knows which detector is running.
 */
export interface SolarDetector {
  name: string;
  scan(input: ScanInput): Promise<ScanResult>;
}

const detectors: Record<string, SolarDetector> = {
  claude: claudeDetector,
  mock: mockDetector,
};

export function getDetector(): SolarDetector {
  const key = process.env.SCAN_DETECTOR ?? "claude";
  const detector = detectors[key];
  if (!detector) {
    throw new Error(
      `Unknown SCAN_DETECTOR "${key}". Valid values: ${Object.keys(detectors).join(", ")}.`,
    );
  }
  return detector;
}
