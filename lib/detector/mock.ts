import type { DetectedHome, ScanInput, ScanResult } from "@/lib/types";
import type { SolarDetector } from "./index";

/**
 * Fake detector for working on the UI without an API key or any cost.
 * Lays out a grid of made-up homes. The results mean nothing.
 */
export const mockDetector: SolarDetector = {
  name: "mock",
  async scan({ width, height }: ScanInput): Promise<ScanResult> {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const homes: DetectedHome[] = [];
    const cols = 4;
    const rows = 2;
    const boxW = Math.round(width / (cols * 1.6));
    const boxH = Math.round(height / (rows * 2.2));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        homes.push({
          box: {
            x: Math.round((width / cols) * c + (width / cols - boxW) / 2),
            y: Math.round((height / rows) * r + (height / rows - boxH) / 2),
            width: boxW,
            height: boxH,
          },
          hasSolar: i % 3 !== 1,
          confidence: (["high", "medium", "low"] as const)[i % 3],
          notes: i % 3 !== 1 ? "Mock: panel array on south roof face" : "Mock: no panels",
          houseNumber: i === 7 ? null : String(1200 + i * 8),
          street: i === 7 ? null : r === 0 ? "W Example Dr" : "W Sample Ln",
          addressSource: i === 7 ? "unknown" : i % 2 ? "inferred" : "visible_label",
        });
      }
    }
    return {
      homes,
      visibleStreets: ["W Example Dr", "W Sample Ln"],
      summary: "Mock detector: these results are placeholders, not a real scan.",
      detector: "mock",
    };
  },
};
