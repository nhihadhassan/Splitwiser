import type { AppState, Expense, ExpenseCategory, Group } from "./types";
import { splitEqually } from "./utils/money";

const MIGRATION_ID = "central-america-wanderlog-2025-v2";
const GROUP_ID = "g-central-america";
const GROUP_NAME = "Central America 2025";
const DEFAULT_MEMBER_IDS = ["me", "p-rachel"];
const LEGACY_EXPENSE_IDS = new Set([
  "e-central-america-air-transat-ao742l",
  "e-central-america-air-transat-yptto3",
  "e-central-america-getyourguide",
  "e-central-america-hostelworld-1",
  "e-central-america-hostelworld-2",
  "e-central-america-hostelworld-3",
  "e-central-america-hostelworld-4",
  "e-central-america-hostelworld-5",
  "e-central-america-airbnb",
]);

type SourceCurrency = "CAD" | "USD" | "GTQ" | "CRC";
type WanderlogExpense = readonly [
  date: string,
  description: string,
  sourceAmount: number,
  currency: SourceCurrency,
  sourceCategory: string,
];

/**
 * Blended trip rates inferred from the PDF's CA$8,067.60 total. The app stores
 * one currency, so original currency values remain in each expense note.
 */
const CAD_RATES: Record<SourceCurrency, number> = {
  CAD: 1,
  USD: 1.455406,
  GTQ: 0.186,
  CRC: 0.00282,
};

const WANDERLOG_EXPENSES: WanderlogExpense[] = [
  ["2024-05-07", "Jaco AirBNB", 183, "CAD", "Lodging"],
  ["2025-03-10", "SJO Airport Bus Stop", 17, "USD", "Food"],
  ["2025-03-10", "Return flight", 974.85, "CAD", "Flights"],
  ["2025-03-09", "Sépalo Restaurante", 15.79, "CAD", "Food"],
  ["2025-03-09", "Hostel Alajuela Backpackers", 8500, "CRC", "Food"],
  ["2025-03-09", "Hostel Alajuela Backpackers", 32.5, "USD", "Lodging"],
  ["2025-03-09", "San José Province", 28, "USD", "Transit"],
  ["2025-03-09", "Jaco Beach", 60, "USD", "Activities"],
  ["2025-03-08", "El Miro", 8, "CAD", "Transit"],
  ["2025-03-08", "Mas X Menos", 20.93, "CAD", "Food"],
  ["2025-03-08", "Los Mahi Tacos De Cholo", 17.08, "CAD", "Food"],
  ["2025-03-08", "Ambrosia Cafe", 2650, "CRC", "Food"],
  ["2025-03-07", "Mas X Menos", 31.53, "CAD", "Groceries"],
  ["2025-03-07", "The Pizza Shop Costa Rica", 14800, "CRC", "Food"],
  ["2025-03-07", "2 Uber to Jaco", 7.27, "CAD", "Transit"],
  ["2025-03-07", "Casa Las Playas", 6000, "CRC", "Transit"],
  ["2025-03-07", "Franco Escalante", 8300, "CRC", "Food"],
  ["2025-03-06", "Chubbs Bar", 1000, "CRC", "Food"],
  ["2025-03-06", "Costa Rica Beer Factory", 4500, "CRC", "Food"],
  ["2025-03-06", "El Lobo Mestizo", 10000, "CRC", "Food"],
  ["2025-03-06", "Arenal Backpackers Resort", 10, "USD", "Food"],
  ["2025-03-06", "Tayakiry café", 14.28, "CAD", "Food"],
  ["2025-03-05", "Churros La Tentación", 3700, "CRC", "Food"],
  ["2025-03-05", "Soda Mima", 18.74, "CAD", "Food"],
  ["2025-03-05", "Kenko La Fortuna", 8.74, "CAD", "Food"],
  ["2025-03-05", "Lost Canyon Adventures Entrance-Desafio", 309.07, "CAD", "Activities"],
  ["2025-03-04", "Spectacolar Cantina", 23.3, "CAD", "Food"],
  ["2025-03-04", "Restaurante El Trapiche", 2.89, "CAD", "Food"],
  ["2025-03-04", "Maxi Palí • La Fortuna", 11.83, "CAD", "Groceries"],
  ["2025-03-04", "Fortuna Waterfall", 45, "USD", "Activities"],
  ["2025-03-03", "Kinkajou Night Walk", 60, "USD", "Activities"],
  ["2025-03-03", "Manakin Lodge Monteverde", 6, "USD", "Food"],
  ["2025-03-03", "Horse Trek Monteverde COSTA RICA", 50, "USD", "Activities"],
  ["2025-03-03", "Cafe Capucchino y Restaurante", 3000, "CRC", "Food"],
  ["2025-03-03", "100% Aventura", 66000, "CRC", "Activities"],
  ["2025-03-02", "Manakin Lodge Monteverde", 6, "USD", "Food"],
  ["2025-03-02", "Megasuper La Cruz", 9.02, "CAD", "Groceries"],
  ["2025-03-02", "McDonald's", 16.64, "CAD", "Food"],
  ["2025-03-02", "Control Migratorio Frontera Nicaragua-Costa Rica en Peñas Blancas", 8, "CAD", "Other"],
  ["2025-03-02", "Megasuper Monteverde", 26.91, "CAD", "Groceries"],
  ["2025-03-01", "Puesta del Sol", 30, "USD", "Activities"],
  ["2025-03-01", "Reserva Natural Ojo de Agua", 70, "CAD", "Activities"],
  ["2025-02-28", "Los Ranchitos Ometepe", 18.93, "CAD", "Food"],
  ["2025-02-27", "Hotel La Posada Del Sol", 16, "USD", "Food"],
  ["2025-02-27", "La Colonia", 18.15, "CAD", "Food"],
  ["2025-02-27", "ECO", 11.3, "USD", "Food"],
  ["2025-02-26", "Hotel La Posada Del Sol", 5, "USD", "Food"],
  ["2025-02-26", "Supermercado La Union", 3.43, "CAD", "Food"],
  ["2025-02-26", "TESCO (Chinese general store)", 14, "CAD", "Shopping"],
  ["2025-02-26", "Villa Azul - Granada, Nicaragua", 30, "USD", "Activities"],
  ["2025-02-26", "Cerro Negro Volcano", 55, "USD", "Activities"],
  ["2025-02-25", "Coco Calala", 18, "USD", "Food"],
  ["2025-02-25", "La Montanita", 6.91, "CAD", "Food"],
  ["2025-02-25", "Los Encuentros", 3.39, "CAD", "Food"],
  ["2025-02-25", "Cafe Via Via", 6.46, "CAD", "Food"],
  ["2025-02-24", "Atami Escape Resort", 4.97, "CAD", "Food"],
  ["2025-02-24", "Akasa Hotel Bar and Grill", 37, "USD", "Food"],
  ["2025-02-24", "Pelicanos Restaurant", 3.5, "USD", "Food"],
  ["2025-02-23", "Akasa Hotel Bar and Grill", 17.6, "USD", "Food"],
  ["2025-02-23", "Restaurante Erika", 18.5, "USD", "Food"],
  ["2025-02-23", "Ixcanal Café", 5, "USD", "Food"],
  ["2025-02-23", "Pupusería Nenita", 3, "USD", "Food"],
  ["2025-02-23", "Chelones", 8, "USD", "Food"],
  ["2025-02-22", "Hotel Posada Alta Vista (Laundry)", 10, "USD", "Other"],
  ["2025-02-22", "El Salvador (Boarder Crossing fees)", 24, "USD", "Other"],
  ["2025-02-22", "COFFEE SHOP Suchitoto CASA DE LA ABUELA", 30, "USD", "Activities"],
  ["2025-02-22", "Art Center for Peace", 5, "USD", "Sightseeing"],
  ["2025-02-22", "COFFEE SHOP Suchitoto CASA DE LA ABUELA", 13.5, "USD", "Shopping"],
  ["2025-02-22", "Súper 7", 8.29, "USD", "Food"],
  ["2025-02-21", "Café Welchez • Copán Ruinas", 21.77, "CAD", "Food"],
  ["2025-02-21", "Luna Jaguar Spa Oficina de informacion", 100, "USD", "Activities"],
  ["2025-02-21", "Copan Ruinas", 56, "USD", "Activities"],
  ["2025-02-20", "Cafe Via Via", 25.12, "CAD", "Food"],
  ["2025-02-20", "Honduras-Guatemala Border", 8, "CAD", "Activities"],
  ["2025-02-20", "Paiz", 6.07, "CAD", "Food"],
  ["2025-02-20", "Llano largo", 5.07, "CAD", "Food"],
  ["2025-02-20", "Lemon Tree Hostel", 2, "CAD", "Food"],
  ["2025-02-20", "Doña Luisa Xicotencatl", 9.97, "CAD", "Food"],
  ["2025-02-19", "El Adobe Antigua Guatemala", 32.49, "CAD", "Food"],
  ["2025-02-19", "Mr Taco Mexican Food", 11, "USD", "Food"],
  ["2025-02-19", "Fotocopias Antigua", 8, "GTQ", "Shopping"],
  ["2025-02-18", "Walking stick + tips", 120, "GTQ", "Other"],
  ["2025-02-18", "Acatenango Volcano Trek & Tour from Antigua 2D/1N", 298, "CAD", "Activities"],
  ["2025-02-17", "Tacos La Loteria", 130, "GTQ", "Food"],
  ["2025-02-17", "Street food and trinkets", 70, "GTQ", "Other"],
  ["2025-02-17", "Convento Santa Clara", 80, "GTQ", "Activities"],
  ["2025-02-17", "Cafeteria & Bakery Santa Clara", 110, "GTQ", "Food"],
  ["2025-02-16", "Hotel Francisco's rest house", 580, "GTQ", "Lodging"],
  ["2025-02-16", "Airport Shuttle", 300, "GTQ", "Transit"],
  ["2025-02-16", "Por Qué No? Cafe", 200, "GTQ", "Food"],
  ["2025-02-16", "Rachel’s Departure", 419.97, "CAD", "Flights"],
  ["2025-02-16", "G Adventures", 3517.3, "CAD", "Other"],
];

const CATEGORY_MAP: Record<string, ExpenseCategory> = {
  Activities: "entertainment",
  Flights: "travel",
  Food: "food",
  Groceries: "groceries",
  Lodging: "travel",
  Other: "general",
  Shopping: "shopping",
  Sightseeing: "entertainment",
  Transit: "transport",
};

function sourceDisplay(amount: number, currency: SourceCurrency): string {
  if (currency === "CAD") return `CA$${amount.toFixed(2)}`;
  return `${currency} ${amount.toFixed(2)}`;
}
function expenseFor(
  entry: WanderlogExpense,
  index: number,
  groupId: string,
  memberIds: string[],
): Expense {
  const [date, description, sourceAmount, currency, sourceCategory] = entry;
  const amount = Math.round(sourceAmount * CAD_RATES[currency] * 100);
  const owes = splitEqually(amount, memberIds.length);
  const display = sourceDisplay(sourceAmount, currency);
  const estimate =
    currency === "CAD"
      ? `Imported from Wanderlog: ${display}.`
      : `Imported from Wanderlog: ${display}. Converted at the trip's blended rate to CA$${(
          amount / 100
        ).toFixed(2)}.`;

  return {
    id: `e-central-america-wanderlog-${String(index + 1).padStart(3, "0")}`,
    description,
    amount,
    category: CATEGORY_MAP[sourceCategory] ?? "general",
    date,
    groupId,
    splitMethod: "equally",
    splits: memberIds.map((personId, splitIndex) => ({
      personId,
      owes: owes[splitIndex],
      paid: personId === "me" ? amount : 0,
    })),
    notes: estimate,
    createdAt: new Date(`${date}T12:00:00Z`).getTime(),
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
      group.name.trim().toLowerCase() === "central america 2026" ||
      group.name.trim().toLowerCase() === GROUP_NAME.toLowerCase(),
  );
  const groupId = existingGroup?.id ?? GROUP_ID;
  const memberIds =
    existingGroup && existingGroup.memberIds.length >= 2
      ? existingGroup.memberIds
      : DEFAULT_MEMBER_IDS;
  const group: Group = {
    id: groupId,
    name: GROUP_NAME,
    type: "trip",
    memberIds,
    createdAt: new Date("2025-02-16T12:00:00Z").getTime(),
    simplifyDebts: true,
  };

  const retainedExpenses = state.expenses.filter(
    (expense) =>
      !LEGACY_EXPENSE_IDS.has(expense.id) &&
      !expense.id.startsWith("e-central-america-wanderlog-"),
  );
  const importedExpenses = WANDERLOG_EXPENSES.map((entry, index) =>
    expenseFor(entry, index, groupId, memberIds),
  );

  return {
    ...state,
    people,
    groups: existingGroup
      ? state.groups.map((candidate) =>
          candidate.id === existingGroup.id ? group : candidate,
        )
      : [...state.groups, group],
    expenses: [...retainedExpenses, ...importedExpenses],
    dataMigrations: [...appliedMigrations, MIGRATION_ID],
  };
}
