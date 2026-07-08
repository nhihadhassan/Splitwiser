import type { ExpenseCategory } from "../types";

export const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: string }> = {
  general: { label: "General", icon: "🧾" },
  food: { label: "Food & drink", icon: "🍽️" },
  groceries: { label: "Groceries", icon: "🛒" },
  rent: { label: "Rent", icon: "🏠" },
  utilities: { label: "Utilities", icon: "💡" },
  transport: { label: "Transport", icon: "🚕" },
  travel: { label: "Travel", icon: "✈️" },
  entertainment: { label: "Entertainment", icon: "🎬" },
  shopping: { label: "Shopping", icon: "🛍️" },
  medical: { label: "Medical", icon: "💊" },
};

export const CATEGORIES = Object.keys(CATEGORY_META) as ExpenseCategory[];
