import type { AppState, Expense, ExpenseCategory, Group } from "./types";
import { splitEqually } from "./utils/money";

const MIGRATION_ID = "central-america-bookings-2026-v1";
const GROUP_ID = "g-central-america";
const DEFAULT_MEMBER_IDS = ["me", "p-rachel"];

const BOOKING_EXPENSES: Array<{
  id: string;
  date: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
}> = [
  {
    id: "e-central-america-air-transat-ao742l",
    date: "2026-05-28",
    description: "Air Transat AO742L",
    amount: 72_787,
    category: "travel",
  },
  {
    id: "e-central-america-air-transat-yptto3",
    date: "2026-05-28",
    description: "Air Transat YPTTO3",
    amount: 73_570,
    category: "travel",
  },
  {
    id: "e-central-america-getyourguide",
    date: "2026-05-29",
    description: "GetYourGuide",
    amount: 28_906,
    category: "entertainment",
  },
  {
    id: "e-central-america-hostelworld-1",
    date: "2026-05-31",
    description: "Hostelworld booking",
    amount: 3_824,
    category: "travel",
  },
  {
    id: "e-central-america-hostelworld-2",
    date: "2026-05-31",
    description: "Hostelworld booking",
    amount: 2_873,
    category: "travel",
  },
  {
    id: "e-central-america-hostelworld-3",
    date: "2026-05-31",
    description: "Hostelworld booking",
    amount: 9_496,
    category: "travel",
  },
  {
    id: "e-central-america-hostelworld-4",
    date: "2026-05-31",
    description: "Hostelworld booking",
    amount: 7_496,
    category: "travel",
  },
  {
    id: "e-central-america-hostelworld-5",
    date: "2026-06-03",
    description: "Hostelworld booking",
    amount: 683,
    category: "travel",
  },
  {
    id: "e-central-america-airbnb",
    date: "2026-06-07",
    description: "Airbnb",
    amount: 46_503,
    category: "travel",
  },
];

function expenseFor(
  booking: (typeof BOOKING_EXPENSES)[number],
  groupId: string,
  memberIds: string[],
): Expense {
  const owes = splitEqually(booking.amount, memberIds.length);
  return {
    id: booking.id,
    description: booking.description,
    amount: booking.amount,
    category: booking.category,
    date: booking.date,
    groupId,
    splitMethod: "equally",
    splits: memberIds.map((personId, index) => ({
      personId,
      owes: owes[index],
      paid: personId === "me" ? booking.amount : 0,
    })),
    notes: "Imported from the Scotiabank expense export as a Central America trip booking.",
    createdAt: new Date(`${booking.date}T12:00:00Z`).getTime(),
    createdBy: "me",
  };
}

export function addCentralAmericaTrip(state: AppState): AppState {
  const appliedMigrations = state.dataMigrations ?? [];
  if (appliedMigrations.includes(MIGRATION_ID)) return state;

  const people = state.people.some((person) => person.id === "p-rachel")
    ? state.people
    : [
        ...state.people,
        {
          id: "p-rachel",
          name: "Rachel",
          email: "rachel@example.com",
          color: "#8656CD",
        },
      ];

  const existingGroup = state.groups.find(
    (group) =>
      group.id === GROUP_ID ||
      group.name.trim().toLowerCase() === "central america 2026",
  );
  const groupId = existingGroup?.id ?? GROUP_ID;
  const memberIds =
    existingGroup && existingGroup.memberIds.length >= 2
      ? existingGroup.memberIds
      : DEFAULT_MEMBER_IDS;
  const group: Group = existingGroup ?? {
    id: groupId,
    name: "Central America 2026",
    type: "trip",
    memberIds,
    createdAt: new Date("2026-05-28T12:00:00Z").getTime(),
    simplifyDebts: true,
  };
  const existingExpenseIds = new Set(state.expenses.map((expense) => expense.id));
  const expenses = [
    ...state.expenses,
    ...BOOKING_EXPENSES.filter(
      (booking) => !existingExpenseIds.has(booking.id),
    ).map((booking) => expenseFor(booking, groupId, memberIds)),
  ];

  return {
    ...state,
    people,
    groups: existingGroup ? state.groups : [...state.groups, group],
    expenses,
    dataMigrations: [...appliedMigrations, MIGRATION_ID],
  };
}
