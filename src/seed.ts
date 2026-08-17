import type { AppState, Expense, ExpenseCategory, ReconciliationState } from "./types";
import { splitEqually } from "./utils/money";
import {
  DEFAULT_CASH_TRANSACTIONS,
  DEFAULT_EXPORT_TRANSACTIONS,
  DEFAULT_STATEMENT_TRANSACTIONS,
} from "./reconciliationData";

export const AVATAR_COLORS = [
  "#5BC5A7",
  "#8656CD",
  "#E4586E",
  "#F5A623",
  "#2F97C1",
  "#B8562F",
  "#5A6B7B",
  "#C94FB8",
];

function reconciliationState(): ReconciliationState {
  return {
    decisions: {},
    matches: {},
    cashRemaining: "",
    cashTransactions: DEFAULT_CASH_TRANSACTIONS,
    secondaryCashTransactions: [],
    cardTransactions: DEFAULT_STATEMENT_TRANSACTIONS,
    exportTransactions: DEFAULT_EXPORT_TRANSACTIONS,
  };
}

export function seedState(): AppState {
  const people = [
    { id: "me", name: "Alex", email: "alex@example.test", color: "#5BC5A7", claimed: true },
    { id: "person-sam", name: "Sam", email: "sam@example.test", color: "#8656CD", claimed: false },
    { id: "person-jules", name: "Jules", email: "jules@example.test", color: "#E4586E", claimed: false },
  ];
  const groups = [
    { id: "group-coast", name: "Coastal Weekend", type: "trip" as const, memberIds: ["me", "person-sam", "person-jules"], createdAt: 1_800_000_000_000, simplifyDebts: true, status: "open" as const, startDate: "2027-01-15", endDate: "2027-01-18", createdBy: "me" },
    { id: "group-cabin", name: "Cabin House", type: "home" as const, memberIds: ["me", "person-sam"], createdAt: 1_800_100_000_000, simplifyDebts: false, status: "open" as const, createdBy: "me" },
    { id: "group-city", name: "City Break", type: "trip" as const, memberIds: ["me", "person-jules"], createdAt: 1_800_200_000_000, simplifyDebts: true, status: "closed" as const, closedAt: 1_800_500_000_000, createdBy: "me" },
  ];
  const expenses: Expense[] = [];

  function addEqual(id: string, description: string, amount: number, category: ExpenseCategory, date: string, groupId: string, payerId: string, memberIds: string[]) {
    const owes = splitEqually(amount, memberIds.length);
    expenses.push({
      id,
      description,
      amount,
      category,
      date,
      groupId,
      splitMethod: "equally",
      splits: memberIds.map((personId, index) => ({ personId, owes: owes[index], paid: personId === payerId ? amount : 0 })),
      createdAt: new Date(`${date}T12:00:00Z`).getTime(),
      createdBy: payerId,
    });
  }

  addEqual("expense-coast-lodge", "Harbour lodge", 48_600, "lodging", "2027-01-15", "group-coast", "me", groups[0].memberIds);
  addEqual("expense-coast-train", "Regional train", 12_750, "transit", "2027-01-15", "group-coast", "person-sam", groups[0].memberIds);
  addEqual("expense-coast-market", "Seaside market", 8_425, "groceries", "2027-01-16", "group-coast", "person-jules", groups[0].memberIds);
  addEqual("expense-coast-kayaks", "Kayak rental", 15_000, "activities", "2027-01-17", "group-coast", "me", groups[0].memberIds);
  addEqual("expense-cabin-supplies", "House supplies", 6_275, "shopping", "2027-02-02", "group-cabin", "person-sam", groups[1].memberIds);
  addEqual("expense-cabin-groceries", "Weekly groceries", 11_350, "groceries", "2027-02-04", "group-cabin", "me", groups[1].memberIds);
  addEqual("expense-city-hotel", "Downtown hotel", 39_900, "lodging", "2026-11-08", "group-city", "me", groups[2].memberIds);
  addEqual("expense-city-gallery", "Gallery tickets", 7_200, "sightseeing", "2026-11-09", "group-city", "person-jules", groups[2].memberIds);

  expenses.push({
    id: "expense-coast-dinner",
    description: "Pier dinner",
    amount: 13_775,
    category: "food",
    date: "2027-01-16",
    groupId: "group-coast",
    splitMethod: "exact",
    splits: [
      { personId: "me", owes: 5_025, paid: 13_775 },
      { personId: "person-sam", owes: 4_250, paid: 0 },
      { personId: "person-jules", owes: 4_500, paid: 0 },
    ],
    createdAt: new Date("2027-01-16T18:00:00Z").getTime(),
    createdBy: "me",
  });

  return {
    people,
    groups,
    expenses,
    settlements: [{ id: "settlement-coast-1", fromId: "person-sam", toId: "me", amount: 5_000, date: "2027-01-18", groupId: "group-coast", createdAt: 1_800_600_000_000, createdBy: "person-sam" }],
    reconciliation: reconciliationState(),
    dataMigrations: ["synthetic-fixtures-v1"],
    financialActivity: [],
  };
}
