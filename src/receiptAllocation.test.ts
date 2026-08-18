import { describe, expect, it } from "vitest";
import { allocationTotal, distributeProportionally } from "./receiptAllocation";

describe("receipt allocation", () => {
  it("assigns every tax and tip minor unit deterministically", () => {
    const allocation = distributeProportionally(5, [
      { personId: "b", weight: 1 },
      { personId: "a", weight: 1 },
      { personId: "c", weight: 1 },
    ]);
    expect(allocation).toEqual([
      { personId: "a", amountMinor: 2 },
      { personId: "b", amountMinor: 2 },
      { personId: "c", amountMinor: 1 },
    ]);
    expect(allocationTotal(allocation)).toBe(5);
  });

  it("preserves discounts exactly", () => {
    const allocation = distributeProportionally(-7, [{ personId: "a", weight: 2 }, { personId: "b", weight: 1 }]);
    expect(allocationTotal(allocation)).toBe(-7);
  });
});
