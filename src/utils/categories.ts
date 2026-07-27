import type { ExpenseCategory } from "../types";

export const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: ExpenseCategory }> = {
  general: { label: "General", icon: "general" },
  food: { label: "Food & drink", icon: "food" },
  groceries: { label: "Groceries", icon: "groceries" },
  rent: { label: "Rent", icon: "rent" },
  utilities: { label: "Utilities", icon: "utilities" },
  transport: { label: "Transport", icon: "transport" },
  travel: { label: "Travel", icon: "travel" },
  entertainment: { label: "Entertainment", icon: "entertainment" },
  shopping: { label: "Shopping", icon: "shopping" },
  medical: { label: "Medical", icon: "medical" },
};

export const CATEGORIES = Object.keys(CATEGORY_META) as ExpenseCategory[];
