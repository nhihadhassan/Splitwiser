import { describe, expect, it } from "vitest";
import { convertMinor, decimalFraction, identityFx, normalizedCurrency } from "./currency";

describe("currency arithmetic", () => {
  it("keeps legacy currency defaults in CAD", () => {
    expect(normalizedCurrency()).toBe("CAD");
    expect(normalizedCurrency("pen")).toBe("PEN");
    expect(identityFx("CAD", "2026-08-18")).toEqual({ rate: "1", rateDate: "2026-08-18", source: "identity" });
  });

  it("converts through decimal fractions, not binary floating point", () => {
    expect(decimalFraction("0.135")).toEqual({ numerator: 135n, denominator: 1000n });
    expect(convertMinor(101, { rate: "0.135" })).toBe(14);
    expect(convertMinor(100, { rate: "1.005" })).toBe(101);
  });
});
