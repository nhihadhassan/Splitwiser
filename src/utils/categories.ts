import type { ExpenseCategory } from "../types";

export const CATEGORIES = [
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
] as const satisfies readonly ExpenseCategory[];

export type SelectableExpenseCategory = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: ExpenseCategory }> = {
  flights: { label: "Flights", icon: "flights" },
  lodging: { label: "Lodging", icon: "lodging" },
  "car-rental": { label: "Car rental", icon: "car-rental" },
  transit: { label: "Transit", icon: "transit" },
  food: { label: "Food", icon: "food" },
  drinks: { label: "Drinks", icon: "drinks" },
  sightseeing: { label: "Sightseeing", icon: "sightseeing" },
  activities: { label: "Activities", icon: "activities" },
  shopping: { label: "Shopping", icon: "shopping" },
  gas: { label: "Gas", icon: "gas" },
  groceries: { label: "Groceries", icon: "groceries" },
  other: { label: "Other", icon: "other" },
  general: { label: "Other", icon: "other" },
  rent: { label: "Lodging", icon: "lodging" },
  utilities: { label: "Other", icon: "other" },
  transport: { label: "Transit", icon: "transit" },
  travel: { label: "Lodging", icon: "lodging" },
  entertainment: { label: "Activities", icon: "activities" },
  medical: { label: "Other", icon: "other" },
};

const has = (text: string, pattern: RegExp) => pattern.test(text.toLowerCase());

export function normalizeExpenseCategory(
  category: ExpenseCategory,
  description = "",
): SelectableExpenseCategory {
  const text = description.trim();
  if (has(text, /\b(gas|fuel|petrol|shell|esso|petro-canada)\b/)) return "gas";
  if (has(text, /\b(car rental|rental car|hertz|avis|enterprise|budget car)\b/)) return "car-rental";
  if (has(text, /\b(flight|airline|airlines|air ticket|airport ticket)\b/)) return "flights";
  if (has(text, /\b(hostel|hotel|airbnb|lodging|accommodation|guesthouse|motel)\b/)) return "lodging";
  if (category === "food" && has(text, /\b(drink|drinks|bar|beer|wine|coffee|espresso|sangria|cocktail|juice)\b/)) return "drinks";
  if (category === "entertainment" && has(text, /\b(museum|monument|castle|cathedral|monastery|tour|walking|sightseeing|oceanario|aquarium)\b/)) return "sightseeing";

  const aliases: Record<ExpenseCategory, SelectableExpenseCategory> = {
    flights: "flights",
    lodging: "lodging",
    "car-rental": "car-rental",
    transit: "transit",
    food: "food",
    drinks: "drinks",
    sightseeing: "sightseeing",
    activities: "activities",
    shopping: "shopping",
    gas: "gas",
    groceries: "groceries",
    other: "other",
    general: "other",
    rent: "lodging",
    utilities: "other",
    transport: "transit",
    travel: "lodging",
    entertainment: "activities",
    medical: "other",
  };
  return aliases[category] ?? "other";
}
