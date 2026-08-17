import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_META, normalizeExpenseCategory } from "./categories";

describe("expense categories", () => {
  it("offers the complete travel category set in the requested order", () => {
    expect(CATEGORIES).toEqual([
      "flights",
      "lodging",
      "car-rental",
      "transit",
      "food",
      "drinks",
      "sightseeing",
      "activities",
      "shopping",
      "gas",
      "groceries",
      "other",
    ]);
    CATEGORIES.forEach((category) => expect(CATEGORY_META[category].icon).toBe(category));
  });

  it("migrates legacy categories without losing useful trip context", () => {
    expect(normalizeExpenseCategory("travel", "Airline tickets")).toBe("flights");
    expect(normalizeExpenseCategory("travel", "Harbour hostel")).toBe("lodging");
    expect(normalizeExpenseCategory("transport", "Shell fuel stop")).toBe("gas");
    expect(normalizeExpenseCategory("food", "Evening sangria")).toBe("drinks");
    expect(normalizeExpenseCategory("entertainment", "Castle walking tour")).toBe("sightseeing");
    expect(normalizeExpenseCategory("general", "Shared fee")).toBe("other");
  });
});
