/** All amounts are stored as integer cents. */

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${rem.toString().padStart(2, "0")}`;
}

/** Parse a user-typed dollar string ("12.50") into cents; returns NaN when invalid. */
export function parseMoney(input: string): number {
  const trimmed = input.trim().replace(/[$,]/g, "");
  if (trimmed === "" || !/^\d*(\.\d{0,2})?$/.test(trimmed)) return NaN;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

/** Convert cents to an editable dollar string. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Split `total` cents into `count` parts that differ by at most one cent
 * and sum exactly to the total.
 */
export function splitEqually(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Distribute `total` cents proportionally to `weights`, correcting rounding
 * drift so the result sums exactly to the total.
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / weightSum);
  const floored = raw.map(Math.floor);
  let leftover = total - floored.reduce((a, b) => a + b, 0);
  // hand out the leftover cents to the largest fractional parts
  const order = raw
    .map((value, i) => ({ frac: value - Math.floor(value), i }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floored];
  for (const { i } of order) {
    if (leftover <= 0) break;
    result[i] += 1;
    leftover -= 1;
  }
  return result;
}
