import type { CurrencyCode, FxSnapshot } from "../types.js";

export const LEGACY_CURRENCY = "CAD" as const;

export function normalizedCurrency(value?: string): CurrencyCode {
  return /^[A-Za-z]{3}$/.test(value ?? "") ? value!.toUpperCase() : LEGACY_CURRENCY;
}

/** Converts a finite decimal string to an integer fraction without Number math. */
export function decimalFraction(value: string): { numerator: bigint; denominator: bigint } {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error("FX rate must be a positive decimal.");
  const decimal = match[2] ?? "";
  const denominator = 10n ** BigInt(decimal.length);
  const numerator = BigInt(`${match[1]}${decimal}`);
  if (numerator <= 0n) throw new Error("FX rate must be positive.");
  return { numerator, denominator };
}

/** Banker's money is not appropriate here: deterministic half-up keeps a
 * one-cent conversion decision understandable and reproducible. */
export function convertMinor(amount: number, rate: Pick<FxSnapshot, "rate">): number {
  if (!Number.isSafeInteger(amount)) throw new Error("Amount must be an integer number of minor units.");
  const { numerator, denominator } = decimalFraction(rate.rate);
  const signed = BigInt(amount) * numerator;
  const positive = signed >= 0n;
  const absolute = positive ? signed : -signed;
  const rounded = (absolute * 2n + denominator) / (denominator * 2n);
  const result = positive ? rounded : -rounded;
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("Converted amount is too large.");
  return Number(result);
}

export function identityFx(_currency: CurrencyCode, date: string): FxSnapshot {
  return { rate: "1", rateDate: date, source: "identity" };
}
