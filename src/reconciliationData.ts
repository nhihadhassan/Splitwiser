import type { CashTransaction, StatementTransaction } from "./types";

export const DEFAULT_CASH_TRANSACTIONS: CashTransaction[] = [
  { id: "cash-coast-pocket", date: "Jan 15, 2027", description: "Travel cash", detail: "Synthetic fixture", amount: 50 },
];

export const DEFAULT_STATEMENT_TRANSACTIONS: Record<string, StatementTransaction[]> = {
  coast: [
    { id: "statement-coast-lodge", date: "Jan 15, 2027", description: "Harbour lodge", detail: "Synthetic card fixture", amount: 486 },
    { id: "statement-coast-market", date: "Jan 16, 2027", description: "Seaside market", detail: "Synthetic card fixture", amount: 84.25 },
    { id: "statement-coast-kayaks", date: "Jan 17, 2027", description: "Kayak rental", detail: "Synthetic card fixture", amount: 150 },
  ],
  cabin: [
    { id: "statement-cabin-supplies", date: "Feb 2, 2027", description: "House supplies", detail: "Synthetic card fixture", amount: 62.75 },
  ],
  city: [
    { id: "statement-city-hotel", date: "Nov 8, 2026", description: "Downtown hotel", detail: "Synthetic card fixture", amount: 399 },
    { id: "statement-city-gallery", date: "Nov 9, 2026", description: "Gallery tickets", detail: "Synthetic card fixture", amount: 72 },
  ],
};

export const DEFAULT_EXPORT_TRANSACTIONS: Record<string, StatementTransaction[]> = {
  coast: [],
  cabin: [],
  city: [],
};

export const DEFAULT_CITY_MATCHES: Record<string, string[]> = {
  "expense-city-hotel": ["statement:statement-city-hotel"],
  "expense-city-gallery": ["statement:statement-city-gallery"],
};
