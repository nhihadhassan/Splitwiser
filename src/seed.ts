import type { AppState } from "./types";
import { splitEqually } from "./utils/money";

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

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Demo data so the app opens looking alive, like a real Splitwise account. */
export function seedState(): AppState {
  const now = Date.now();
  const state: AppState = {
    people: [
      { id: "me", name: "You", email: "you@example.com", color: "#5BC5A7" },
      { id: "p-ana", name: "Ana Silva", email: "ana@example.com", color: "#8656CD" },
      { id: "p-ben", name: "Ben Carter", email: "ben@example.com", color: "#E4586E" },
      { id: "p-mei", name: "Mei Tanaka", email: "mei@example.com", color: "#F5A623" },
      { id: "p-sam", name: "Sam O'Neil", email: "sam@example.com", color: "#2F97C1" },
    ],
    groups: [
      {
        id: "g-apartment",
        name: "Apartment 4B",
        type: "home",
        memberIds: ["me", "p-ana", "p-ben"],
        createdAt: now - 90 * 86400000,
        simplifyDebts: false,
      },
      {
        id: "g-lisbon",
        name: "Lisbon Trip",
        type: "trip",
        memberIds: ["me", "p-ana", "p-mei", "p-sam"],
        createdAt: now - 30 * 86400000,
        simplifyDebts: true,
      },
    ],
    expenses: [],
    settlements: [],
  };

  const addEqual = (
    id: string,
    description: string,
    amount: number,
    category: AppState["expenses"][number]["category"],
    date: string,
    groupId: string | null,
    payerId: string,
    memberIds: string[],
    createdAt: number,
  ) => {
    const owes = splitEqually(amount, memberIds.length);
    state.expenses.push({
      id,
      description,
      amount,
      category,
      date,
      groupId,
      splitMethod: "equally",
      splits: memberIds.map((personId, i) => ({
        personId,
        owes: owes[i],
        paid: personId === payerId ? amount : 0,
      })),
      createdAt,
      createdBy: payerId,
    });
  };

  addEqual("e-rent", "October rent", 240000, "rent", daysAgo(6), "g-apartment", "me", ["me", "p-ana", "p-ben"], now - 6 * 86400000);
  addEqual("e-internet", "Internet bill", 7998, "utilities", daysAgo(4), "g-apartment", "p-ana", ["me", "p-ana", "p-ben"], now - 4 * 86400000);
  addEqual("e-groceries", "Weekly groceries", 12645, "groceries", daysAgo(2), "g-apartment", "p-ben", ["me", "p-ana", "p-ben"], now - 2 * 86400000);
  addEqual("e-flights", "Flights to Lisbon", 96000, "travel", daysAgo(21), "g-lisbon", "me", ["me", "p-ana", "p-mei", "p-sam"], now - 21 * 86400000);
  addEqual("e-airbnb", "Airbnb, 4 nights", 68400, "travel", daysAgo(20), "g-lisbon", "p-mei", ["me", "p-ana", "p-mei", "p-sam"], now - 20 * 86400000);
  addEqual("e-dinner", "Seafood dinner", 18760, "food", daysAgo(19), "g-lisbon", "p-sam", ["me", "p-ana", "p-mei", "p-sam"], now - 19 * 86400000);
  addEqual("e-taxi", "Airport taxi", 3200, "transport", daysAgo(18), "g-lisbon", "p-ana", ["me", "p-ana", "p-mei", "p-sam"], now - 18 * 86400000);
  addEqual("e-lunch", "Lunch at Cafe Rio", 4420, "food", daysAgo(1), null, "me", ["me", "p-ben"], now - 1 * 86400000);

  state.settlements.push({
    id: "s-1",
    fromId: "p-sam",
    toId: "me",
    amount: 10000,
    date: daysAgo(10),
    groupId: "g-lisbon",
    createdAt: now - 10 * 86400000,
    createdBy: "p-sam",
  });

  return state;
}
