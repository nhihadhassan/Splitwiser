import { describe, expect, it } from "vitest";
import { percentageInputsFromAmounts, splitByWeights } from "./money";

describe("editable split inputs", () => {
  it("keeps exact cent allocations when percentages are reopened for editing", () => {
    const amounts = [1_667, 3_334, 5_000];
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const percentages = percentageInputsFromAmounts(amounts, total).map(Number);
    expect(percentages.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 6);
    expect(splitByWeights(total, percentages)).toEqual(amounts);
  });

  it("represents a three-way cent split as exactly 100 percent", () => {
    const amounts = [3_334, 3_334, 3_333];
    const percentages = percentageInputsFromAmounts(amounts, 10_001).map(Number);
    expect(percentages.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 6);
    expect(splitByWeights(10_001, percentages)).toEqual(amounts);
  });
});
