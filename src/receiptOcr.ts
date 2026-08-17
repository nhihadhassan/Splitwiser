export interface ParsedReceipt {
  merchant: string;
  totalCents: number | null;
  date: string | null;
  totalCandidates: Array<{ cents: number; line: string; score: number }>;
}

const EXCLUDED_TOTAL_LINE = /\b(sub\s*total|tax|tip|gratuity|change|cash|visa|mastercard|amex|debit|credit|payment|tender|balance due)\b/i;
const TOTAL_WORD = /\b(grand\s+total|amount\s+due|total)\b/i;
const MONEY = /(?:\$|cad\s*)?(-?\d{1,5}(?:[,.]\d{2}))(?!\d)/gi;
const HAS_MONEY = /(?:\$|cad\s*)?-?\d{1,5}(?:[,.]\d{2})(?!\d)/i;

function parseDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const northAmerican = text.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2}|\d{2})\b/);
  if (northAmerican) {
    const year = northAmerican[3].length === 2 ? `20${northAmerican[3]}` : northAmerican[3];
    return `${year}-${northAmerican[1].padStart(2, "0")}-${northAmerican[2].padStart(2, "0")}`;
  }
  return null;
}

function merchantFrom(lines: string[]): string {
  const ignored = /\b(receipt|invoice|welcome|thank|tel|phone|www\.|https?|hst|gst|order|table|server|date|time)\b/i;
  const candidate = lines.slice(0, 8).find((line) =>
    line.length >= 3 && line.length <= 60 && /[A-Za-z]{3}/.test(line) && !ignored.test(line) && !HAS_MONEY.test(line),
  );
  return candidate?.replace(/[^\p{L}\p{N}&' .-]/gu, "").replace(/\s+/g, " ").trim() ?? "";
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const totalCandidates: ParsedReceipt["totalCandidates"] = [];
  lines.forEach((line, index) => {
    if (EXCLUDED_TOTAL_LINE.test(line)) return;
    MONEY.lastIndex = 0;
    for (const match of line.matchAll(MONEY)) {
      const value = Number(match[1].replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) continue;
      const cents = Math.round(value * 100);
      const score = (TOTAL_WORD.test(line) ? 100 : 0) + (line.includes("$") ? 8 : 0) + Math.round((index / Math.max(lines.length, 1)) * 20) + Math.min(cents / 10_000, 15);
      totalCandidates.push({ cents, line, score });
    }
  });
  totalCandidates.sort((a, b) => b.score - a.score || b.cents - a.cents);
  return {
    merchant: merchantFrom(lines),
    totalCents: totalCandidates[0]?.cents ?? null,
    date: parseDate(rawText),
    totalCandidates: totalCandidates.slice(0, 5),
  };
}

export async function prepareReceiptImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a receipt image.");
  const source = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser cannot process receipt images.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.filter = "grayscale(1) contrast(1.22)";
  context.drawImage(source, 0, 0, width, height);
  source.close();

  let quality = 0.86;
  let blob: Blob | null = null;
  while (quality >= 0.46) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= 1_000_000) break;
    quality -= 0.1;
  }
  if (!blob || blob.size > 1_000_000) throw new Error("Receipt image could not be reduced below 1 MB.");
  return { blob, width, height };
}

export async function scanReceipt(blob: Blob, onProgress?: (progress: number) => void): Promise<{ text: string; parsed: ParsedReceipt }> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/",
    langPath: "/tesseract/",
    logger: (message) => {
      if (message.status === "recognizing text" && typeof message.progress === "number") onProgress?.(message.progress);
    },
  });
  try {
    const result = await worker.recognize(blob);
    return { text: result.data.text, parsed: parseReceiptText(result.data.text) };
  } finally {
    await worker.terminate();
  }
}
