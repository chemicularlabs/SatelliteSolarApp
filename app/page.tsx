"use client";

import { useMemo, useRef, useState } from "react";
import type { DetectedHome, ScanResult } from "@/lib/types";

// The model reads images at up to 2576px on the long edge, and its pixel
// coordinates match the image 1:1 at or below that size. Shrinking larger
// uploads in the browser keeps the boxes aligned and the upload small.
const MAX_LONG_EDGE = 2576;

type Status = "ready" | "scanning" | "done" | "error";

interface ImageItem {
  id: string;
  name: string;
  /** The (possibly shrunk) image that is sent to the scanner. */
  blob: Blob;
  url: string;
  width: number;
  height: number;
  status: Status;
  error?: string;
  result?: ScanResult;
}

interface Row {
  key: string;
  label: number;
  imageName: string;
  home: DetectedHome;
  address: string | null;
}

async function prepareImage(file: File): Promise<ImageItem> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", 0.92),
  );
  return {
    id: crypto.randomUUID(),
    name: file.name,
    blob,
    url: URL.createObjectURL(blob),
    width,
    height,
    status: "ready",
  };
}

function formatAddress(home: DetectedHome, locationHint: string): string | null {
  if (!home.street) return null;
  const line = [home.houseNumber, home.street].filter(Boolean).join(" ");
  return locationHint ? `${line}, ${locationHint}` : line;
}

const SOURCE_LABEL: Record<DetectedHome["addressSource"], string> = {
  visible_label: "Read from image",
  inferred: "Inferred",
  unknown: "Not found",
};

function toCsv(rows: Row[]): string {
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ["#", "Address", "Address source", "Solar", "Confidence", "Notes", "Image"];
  const lines = rows.map((r) =>
    [
      String(r.label),
      r.address ?? "",
      SOURCE_LABEL[r.home.addressSource],
      r.home.hasSolar ? "Yes" : "No",
      r.home.confidence,
      r.home.notes,
      r.imageName,
    ]
      .map(quote)
      .join(","),
  );
  return [header.map(quote).join(","), ...lines].join("\r\n");
}

export default function Page() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [locationHint, setLocationHint] = useState("");
  const [scanning, setScanning] = useState(false);
  const [solarOnly, setSolarOnly] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (id: string, changes: Partial<ImageItem>) =>
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...changes } : img)));

  async function addFiles(files: FileList | File[]) {
    setUploadError(null);
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) {
      setUploadError("Those files are not images. Use JPEG or PNG screenshots.");
      return;
    }
    try {
      const prepared = await Promise.all(picked.map(prepareImage));
      setImages((prev) => [...prev, ...prepared]);
    } catch {
      setUploadError("One of those images could not be opened. Try saving it again as a JPEG or PNG.");
    }
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const gone = prev.find((img) => img.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((img) => img.id !== id);
    });
  }

  async function scanOne(img: ImageItem) {
    patch(img.id, { status: "scanning", error: undefined });
    try {
      const form = new FormData();
      form.append("image", img.blob, "image.jpg");
      form.append("width", String(img.width));
      form.append("height", String(img.height));
      form.append("locationHint", locationHint);
      const res = await fetch("/api/scan", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        throw new Error(body?.error ?? `Scan failed (HTTP ${res.status}).`);
      }
      patch(img.id, { status: "done", result: body as ScanResult });
    } catch (err) {
      patch(img.id, { status: "error", error: err instanceof Error ? err.message : "Scan failed." });
    }
  }

  async function scanAll() {
    setScanning(true);
    // Images already scanned successfully are skipped, so pressing Scan again
    // only retries failures and picks up newly added images.
    const todo = images.filter((img) => img.status !== "done");
    for (const img of todo) {
      await scanOne(img);
    }
    setScanning(false);
  }

  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = [];
    for (const img of images) {
      img.result?.homes.forEach((home, i) => {
        rows.push({
          key: `${img.id}-${i}`,
          label: rows.length + 1,
          imageName: img.name,
          home,
          address: formatAddress(home, locationHint.trim()),
        });
      });
    }
    return rows;
  }, [images, locationHint]);

  const rows = solarOnly ? allRows.filter((r) => r.home.hasSolar) : allRows;
  const scanned = images.filter((img) => img.result);
  const pending = images.filter((img) => img.status !== "done").length;
  const solarCount = allRows.filter((r) => r.home.hasSolar).length;

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "solar-homes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <h1>Solar Roof Scanner</h1>
      <p className="lede">Upload aerial screenshots of a neighborhood and scan them for homes with rooftop solar.</p>

      <section className="panel">
        <h2>1. Add images</h2>
        <label
          className={`dropzone${dragOver ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addFiles(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <strong>Choose images</strong> or drag them here
          <br />
          Zoom in until roofs are clear, and keep street names and house numbers visible.
        </label>
        {uploadError && <div className="error-box">{uploadError}</div>}

        {images.length > 0 && (
          <div className="thumbs">
            {images.map((img) => (
              <div className="thumb" key={img.id}>
                <img src={img.url} alt="" />
                <div className="meta">
                  <span className="name" title={img.name}>{img.name}</span>
                  {!scanning && (
                    <button onClick={() => removeImage(img.id)} aria-label={`Remove ${img.name}`}>✕</button>
                  )}
                </div>
                <div className={`status ${img.status}`} title={img.error}>
                  {img.status === "ready" && "Ready"}
                  {img.status === "scanning" && "Scanning…"}
                  {img.status === "done" && `${img.result!.homes.length} homes found`}
                  {img.status === "error" && "Failed"}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <label htmlFor="hint">Where are these images? (optional)</label>
          <input
            id="hint"
            value={locationHint}
            onChange={(e) => setLocationHint(e.target.value)}
            placeholder="Chandler, AZ 85249"
            disabled={scanning}
          />
          <small>City, state and ZIP. Added to the end of each address the scanner reads.</small>
        </div>

        <div className="actions">
          <button className="primary" onClick={scanAll} disabled={scanning || pending === 0}>
            {scanning ? "Scanning…" : "Scan"}
          </button>
          {scanning && <span>This can take a minute or two per image.</span>}
        </div>
        {images
          .filter((img) => img.status === "error")
          .map((img) => (
            <div className="error-box" key={img.id}>
              <strong>{img.name}:</strong> {img.error}
            </div>
          ))}
      </section>

      {scanned.length > 0 && (
        <section className="panel">
          <div className="results-head">
            <h2>
              2. Results: {solarCount} solar {solarCount === 1 ? "home" : "homes"} of {allRows.length} found
            </h2>
            <div className="toolbar">
              <label>
                <input type="checkbox" checked={solarOnly} onChange={(e) => setSolarOnly(e.target.checked)} /> Solar
                homes only
              </label>
              <button className="secondary" onClick={downloadCsv} disabled={rows.length === 0}>
                Download CSV
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="empty">
              {allRows.length === 0
                ? "No homes were found in these images."
                : "No solar homes were found. Untick “Solar homes only” to see every home."}
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Address</th>
                    <th>Address source</th>
                    <th>Solar</th>
                    <th>Confidence</th>
                    <th>Notes</th>
                    <th>Image</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="num">{r.label}</td>
                      <td className={`addr${r.address ? "" : " missing"}`}>{r.address ?? "No address visible"}</td>
                      <td>{SOURCE_LABEL[r.home.addressSource]}</td>
                      <td>
                        <span className={`badge ${r.home.hasSolar ? "solar" : "nosolar"}`}>
                          {r.home.hasSolar ? "Solar" : "No solar"}
                        </span>
                      </td>
                      <td>{r.home.confidence}</td>
                      <td className="notes">{r.home.notes}</td>
                      <td className="notes">{r.imageName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {scanned.map((img) => {
            const shown = allRows.filter(
              (r) => r.key.startsWith(`${img.id}-`) && (!solarOnly || r.home.hasSolar),
            );
            const stroke = Math.max(2, Math.round(img.width / 400));
            const font = Math.max(14, Math.round(img.width / 55));
            return (
              <div className="image-result" key={img.id}>
                <h3>{img.name}</h3>
                <p>{img.result!.summary}</p>
                <div className="overlay">
                  <img src={img.url} alt={`Scanned image ${img.name}`} />
                  <svg viewBox={`0 0 ${img.width} ${img.height}`} preserveAspectRatio="none">
                    {shown.map((r) => {
                      const color = r.home.hasSolar ? "#f59e0b" : "#94a3b8";
                      const { x, y, width, height } = r.home.box;
                      return (
                        <g key={r.key}>
                          <rect x={x} y={y} width={width} height={height} fill="none" stroke={color} strokeWidth={stroke} />
                          <rect x={x} y={y - font * 1.3} width={font * 1.9} height={font * 1.3} fill={color} />
                          <text x={x + font * 0.95} y={y - font * 0.3} fontSize={font} fontWeight="700" textAnchor="middle" fill="#111">
                            {r.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
