import type { AppState } from "./types";
import { addCentralAmericaTrip } from "./centralAmericaTrip";
import { splitEqually } from "./utils/money";
import { DEFAULT_EXPENSE_EXPORT_TRANSACTIONS, DEFAULT_PERU_CASH_TRANSACTIONS, DEFAULT_SCOTIABANK_TRANSACTIONS } from "./reconciliationData";

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

/**
 * Demo data: a real completed trip (Portugal, June 2026) recorded as a
 * two-person split between "You" and a travel companion. EUR expenses were
 * converted to CAD at the trip's blended rate (EUR 1 = CA$1.622829); the app
 * is single-currency so all amounts are stored as CAD cents. Every expense was
 * paid by "You" and split equally, so the companion owes their half.
 */
export function seedState(): AppState {
  const tripCreatedAt = new Date("2026-06-08T12:00:00Z").getTime();
  const state: AppState = {
    people: [
      { id: "me", name: "Nhihad", email: "you@example.com", color: "#5BC5A7" },
      { id: "p-rachel", name: "Rachel", email: "rachel@example.com", color: "#8656CD" },
      { id: "p-bijan", name: "Bijan", color: "#C57C55" },
    ],
    groups: [
      {
        id: "g-portugal",
        name: "Portugal 2026",
        type: "trip",
        memberIds: ["me", "p-rachel"],
        createdAt: tripCreatedAt,
        simplifyDebts: true,
      },
      {
        id: "g-new-york",
        name: "New York 2026",
        type: "trip",
        memberIds: ["me", "p-bijan"],
        createdAt: new Date("2026-06-25T12:00:00Z").getTime(),
        simplifyDebts: true,
      },
      {
        id: "g-peru",
        name: "Peru 2026",
        type: "trip",
        memberIds: ["me", "p-rachel"],
        createdAt: new Date("2026-07-11T12:00:00Z").getTime(),
        simplifyDebts: true,
      },
    ],
    expenses: [],
    settlements: [],
    reconciliation: {
      decisions: {},
      matches: {},
      cashRemaining: "",
      cashTransactions: DEFAULT_PERU_CASH_TRANSACTIONS,
      cardTransactions: DEFAULT_SCOTIABANK_TRANSACTIONS,
      exportTransactions: DEFAULT_EXPENSE_EXPORT_TRANSACTIONS,
    },
    dataMigrations: [],
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
    notes?: string,
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
      notes,
    });
  };

  const addWanderlog = (
    id: string,
    description: string,
    amount: number,
    currency: "CAD" | "PEN" | "USD",
    category: AppState["expenses"][number]["category"],
    date: string,
    groupId: "g-new-york" | "g-peru",
    memberIds: string[],
  ) => {
    const rate = currency === "CAD" ? 1 : currency === "PEN" ? 0.42 : 1.37;
    const display = currency === "CAD" ? `CA$${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
    const note = currency === "CAD"
      ? `Imported from Wanderlog: ${display}.`
      : `Imported from Wanderlog: ${display}. Estimated at CA$${(amount * rate).toFixed(2)} for the shared ledger.`;
    addEqual(id, description, Math.round(amount * rate * 100), category, date, groupId, "me", memberIds, new Date(`${date}T12:00:00Z`).getTime(), note);
  };

  addEqual("e-pt-001", "Air Transat 480", 73570, "travel", "2026-06-08", "g-portugal", "me", ["me", "p-rachel"], 1780920000000);
  addEqual("e-pt-002", "We Hate F Tourists - Hostel", 25706, "travel", "2026-06-09", "g-portugal", "me", ["me", "p-rachel"], 1781006400000);
  addEqual("e-pt-003", "Fauna & Flora- Anjos", 1369, "food", "2026-06-09", "g-portugal", "me", ["me", "p-rachel"], 1781006400000);
  addEqual("e-pt-004", "Pastelaria Lenita", 193, "food", "2026-06-09", "g-portugal", "me", ["me", "p-rachel"], 1781006400000);
  addEqual("e-pt-005", "Metro Baixa Chiado", 387, "transport", "2026-06-09", "g-portugal", "me", ["me", "p-rachel"], 1781006400000);
  addEqual("e-pt-006", "Retiro Dos Sentidos", 2434, "entertainment", "2026-06-09", "g-portugal", "me", ["me", "p-rachel"], 1781006400000);
  addEqual("e-pt-007", "Praça do Comércio", 1623, "entertainment", "2026-06-10", "g-portugal", "me", ["me", "p-rachel"], 1781092800000);
  addEqual("e-pt-008", "Fruit cup", 649, "food", "2026-06-10", "g-portugal", "me", ["me", "p-rachel"], 1781092800000);
  addEqual("e-pt-009", "Nata Portuguesa", 237, "food", "2026-06-10", "g-portugal", "me", ["me", "p-rachel"], 1781092800000);
  addEqual("e-pt-010", "Zubir Churrasqueira", 1775, "food", "2026-06-10", "g-portugal", "me", ["me", "p-rachel"], 1781092800000);
  addEqual("e-pt-011", "Frei Papinhas Restaurant", 323, "food", "2026-06-10", "g-portugal", "me", ["me", "p-rachel"], 1781092800000);
  addEqual("e-pt-012", "Sangria", 646, "food", "2026-06-10", "g-portugal", "me", ["me", "p-rachel"], 1781092800000);
  addEqual("e-pt-013", "Monumento a Afonso de Albuquerque", 1623, "entertainment", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-014", "Jerónimos Monastery", 811, "shopping", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-015", "Pineapple drink", 1613, "food", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-016", "Pastéis de Belém", 516, "food", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-017", "Cais do Sodre", 629, "transport", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-018", "Nosolo Italia", 516, "food", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-019", "Pita.gr FoodTruck Chef Thassos", 1461, "food", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-020", "Chickinho Lx Factory", 1609, "food", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-021", "100 Montaditos Rossio", 932, "food", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-022", "Bolt", 1026, "transport", "2026-06-11", "g-portugal", "me", ["me", "p-rachel"], 1781179200000);
  addEqual("e-pt-023", "Oceanário de Lisboa", 3930, "entertainment", "2026-06-12", "g-portugal", "me", ["me", "p-rachel"], 1781265600000);
  addEqual("e-pt-024", "Castelo de São Jorge", 2749, "entertainment", "2026-06-12", "g-portugal", "me", ["me", "p-rachel"], 1781265600000);
  addEqual("e-pt-025", "Bolt", 1814, "transport", "2026-06-12", "g-portugal", "me", ["me", "p-rachel"], 1781265600000);
  addEqual("e-pt-026", "Lisboa Cheia de Graça", 1941, "food", "2026-06-12", "g-portugal", "me", ["me", "p-rachel"], 1781265600000);
  addEqual("e-pt-027", "Pastelaria Aloma", 475, "food", "2026-06-12", "g-portugal", "me", ["me", "p-rachel"], 1781265600000);
  addEqual("e-pt-028", "Zeluna", 647, "food", "2026-06-12", "g-portugal", "me", ["me", "p-rachel"], 1781265600000);
  addEqual("e-pt-029", "Water", 171, "food", "2026-06-12", "g-portugal", "me", ["me", "p-rachel"], 1781265600000);
  addEqual("e-pt-030", "Castelo Souvenir Shop", 1116, "shopping", "2026-06-12", "g-portugal", "me", ["me", "p-rachel"], 1781265600000);
  addEqual("e-pt-031", "Sol a Sol Hostel", 17157, "travel", "2026-06-13", "g-portugal", "me", ["me", "p-rachel"], 1781352000000);
  addEqual("e-pt-032", "Continente Bom Dia Rua da Palma", 1967, "groceries", "2026-06-13", "g-portugal", "me", ["me", "p-rachel"], 1781352000000);
  addEqual("e-pt-033", "Rede Expressos to Lagos", 1758, "transport", "2026-06-13", "g-portugal", "me", ["me", "p-rachel"], 1781352000000);
  addEqual("e-pt-034", "Bar Mellow Loco", 486, "food", "2026-06-13", "g-portugal", "me", ["me", "p-rachel"], 1781352000000);
  addEqual("e-pt-035", "Indigo Bar", 2462, "food", "2026-06-14", "g-portugal", "me", ["me", "p-rachel"], 1781438400000);
  addEqual("e-pt-036", "Ponta da Piedade Tours", 6491, "entertainment", "2026-06-14", "g-portugal", "me", ["me", "p-rachel"], 1781438400000);
  addEqual("e-pt-037", "Pizza Hut", 802, "food", "2026-06-14", "g-portugal", "me", ["me", "p-rachel"], 1781438400000);
  addEqual("e-pt-038", "Kohinoor Indian Restaurant", 3321, "food", "2026-06-14", "g-portugal", "me", ["me", "p-rachel"], 1781438400000);
  addEqual("e-pt-039", "Pizza Garage", 1450, "food", "2026-06-15", "g-portugal", "me", ["me", "p-rachel"], 1781524800000);
  addEqual("e-pt-040", "Lagos Beer&Co", 486, "food", "2026-06-15", "g-portugal", "me", ["me", "p-rachel"], 1781524800000);
  addEqual("e-pt-041", "Air Transat 7463", 72787, "travel", "2026-06-16", "g-portugal", "me", ["me", "p-rachel"], 1781611200000);
  addEqual("e-pt-042", "The Original Grater", 1624, "shopping", "2026-06-16", "g-portugal", "me", ["me", "p-rachel"], 1781611200000);
  addEqual("e-pt-043", "Souvenir", 1202, "shopping", "2026-06-16", "g-portugal", "me", ["me", "p-rachel"], 1781611200000);
  addEqual("e-pt-044", "La Focaccia", 975, "food", "2026-06-16", "g-portugal", "me", ["me", "p-rachel"], 1781611200000);
  addEqual("e-pt-045", "Lagos to Lisbon", 1762, "transport", "2026-06-16", "g-portugal", "me", ["me", "p-rachel"], 1781611200000);
  addEqual("e-pt-046", "Uber to Porto Bus Stn", 640, "transport", "2026-06-16", "g-portugal", "me", ["me", "p-rachel"], 1781611200000);
  addEqual("e-pt-047", "illicit Burgers", 1429, "food", "2026-06-16", "g-portugal", "me", ["me", "p-rachel"], 1781611200000);
  addEqual("e-pt-048", "Snacks", 406, "food", "2026-06-16", "g-portugal", "me", ["me", "p-rachel"], 1781611200000);
  addEqual("e-pt-049", "Hostel Green Heart", 41626, "travel", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-050", "The Bakery Café", 2260, "food", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-051", "Nata Portuguesa", 239, "food", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-052", "Yak & Yeti (Lisbon)", 4056, "food", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-053", "McDonald's", 683, "food", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-054", "Groceries", 2081, "groceries", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-055", "Food", 840, "groceries", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-056", "Groceries", 374, "groceries", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-057", "Groceries", 252, "groceries", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-058", "Transit", 312, "transport", "2026-06-17", "g-portugal", "me", ["me", "p-rachel"], 1781697600000);
  addEqual("e-pt-059", "Drinks", 342, "food", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-060", "Groceries", 323, "groceries", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-061", "Praça do Comércio", 3246, "entertainment", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-062", "Pastelaria Santo António", 456, "food", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-063", "Castelo de São Jorge", 2771, "entertainment", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-064", "Breakfast Lovers Tram 28", 3080, "entertainment", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-065", "Bonjardim", 5215, "food", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-066", "Pingo", 125, "groceries", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-067", "Pingo", 324, "groceries", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-068", "Other", 1630, "general", "2026-06-18", "g-portugal", "me", ["me", "p-rachel"], 1781784000000);
  addEqual("e-pt-069", "Restaurante Atlantiko Sintra", 6715, "food", "2026-06-19", "g-portugal", "me", ["me", "p-rachel"], 1781870400000);
  addEqual("e-pt-070", "Aldi", 2216, "groceries", "2026-06-19", "g-portugal", "me", ["me", "p-rachel"], 1781870400000);
  addEqual("e-pt-071", "Espresso", 650, "food", "2026-06-19", "g-portugal", "me", ["me", "p-rachel"], 1781870400000);
  addEqual("e-pt-072", "COPACABANA", 1544, "food", "2026-06-19", "g-portugal", "me", ["me", "p-rachel"], 1781870400000);
  addEqual("e-pt-073", "Tv. da Lomba 34", 46503, "travel", "2026-06-20", "g-portugal", "me", ["me", "p-rachel"], 1781956800000);
  addEqual("e-pt-074", "Café Santiago", 3433, "food", "2026-06-20", "g-portugal", "me", ["me", "p-rachel"], 1781956800000);
  addEqual("e-pt-075", "Manteigaria", 244, "food", "2026-06-20", "g-portugal", "me", ["me", "p-rachel"], 1781956800000);
  addEqual("e-pt-076", "Bolt to Airbnb", 716, "transport", "2026-06-20", "g-portugal", "me", ["me", "p-rachel"], 1781956800000);
  addEqual("e-pt-077", "Pastel de Nata", 488, "food", "2026-06-20", "g-portugal", "me", ["me", "p-rachel"], 1781956800000);
  addEqual("e-pt-078", "Pastel de Nata", 488, "food", "2026-06-20", "g-portugal", "me", ["me", "p-rachel"], 1781956800000);
  addEqual("e-pt-079", "Bolt", 1326, "transport", "2026-06-20", "g-portugal", "me", ["me", "p-rachel"], 1781956800000);
  addEqual("e-pt-080", "Lisbon to Porto", 4179, "transport", "2026-06-20", "g-portugal", "me", ["me", "p-rachel"], 1781956800000);
  addEqual("e-pt-081", "Souvenirs Porto", 814, "shopping", "2026-06-21", "g-portugal", "me", ["me", "p-rachel"], 1782043200000);
  addEqual("e-pt-082", "Combi Coffee Roasters", 293, "food", "2026-06-21", "g-portugal", "me", ["me", "p-rachel"], 1782043200000);
  addEqual("e-pt-083", "Mamma Bella Cais de Gaia", 5386, "food", "2026-06-21", "g-portugal", "me", ["me", "p-rachel"], 1782043200000);
  addEqual("e-pt-084", "Douro Valley Tour", 28906, "entertainment", "2026-06-22", "g-portugal", "me", ["me", "p-rachel"], 1782129600000);
  addEqual("e-pt-085", "Continente Bom Dia Porto - Luís de Aguiar", 4600, "food", "2026-06-22", "g-portugal", "me", ["me", "p-rachel"], 1782129600000);
  addEqual("e-pt-086", "Porto walking tour", 3246, "entertainment", "2026-06-22", "g-portugal", "me", ["me", "p-rachel"], 1782129600000);
  addEqual("e-pt-087", "Churros Papa Tony", 2113, "food", "2026-06-22", "g-portugal", "me", ["me", "p-rachel"], 1782129600000);
  addEqual("e-pt-088", "Manteigaria", 976, "food", "2026-06-22", "g-portugal", "me", ["me", "p-rachel"], 1782129600000);
  addEqual("e-pt-089", "Fábrica da Nata (Praça Almeida Garrett)", 244, "food", "2026-06-22", "g-portugal", "me", ["me", "p-rachel"], 1782129600000);
  addEqual("e-pt-090", "Regua", 1253, "food", "2026-06-22", "g-portugal", "me", ["me", "p-rachel"], 1782129600000);
  addEqual("e-pt-091", "Pão Fôfo", 203, "food", "2026-06-22", "g-portugal", "me", ["me", "p-rachel"], 1782129600000);
  addEqual("e-pt-092", "Han Table Barbecue Porto", 3246, "food", "2026-06-22", "g-portugal", "me", ["me", "p-rachel"], 1782129600000);
  addEqual("e-pt-093", "Manteigaria - Fábrica de Pastéis de Nata", 811, "food", "2026-06-23", "g-portugal", "me", ["me", "p-rachel"], 1782216000000);
  addEqual("e-pt-094", "A Pérola do Bolhão", 1448, "shopping", "2026-06-23", "g-portugal", "me", ["me", "p-rachel"], 1782216000000);
  addEqual("e-pt-095", "Espresso", 155, "food", "2026-06-23", "g-portugal", "me", ["me", "p-rachel"], 1782216000000);
  addEqual("e-pt-096", "Hammer", 651, "shopping", "2026-06-23", "g-portugal", "me", ["me", "p-rachel"], 1782216000000);
  addEqual("e-pt-097", "Bifana", 1054, "food", "2026-06-23", "g-portugal", "me", ["me", "p-rachel"], 1782216000000);
  addEqual("e-pt-098", "Manteigaria", 732, "food", "2026-06-23", "g-portugal", "me", ["me", "p-rachel"], 1782216000000);
  addEqual("e-pt-099", "Café Santiago F", 2750, "food", "2026-06-23", "g-portugal", "me", ["me", "p-rachel"], 1782216000000);
  addEqual("e-pt-100", "Tim Hortons", 2169, "food", "2026-06-24", "g-portugal", "me", ["me", "p-rachel"], 1782302400000);
  addEqual("e-pt-101", "Airport Snacks", 640, "food", "2026-06-24", "g-portugal", "me", ["me", "p-rachel"], 1782302400000);
  addEqual("e-pt-102", "Port Wine Gift", 2043, "food", "2026-06-24", "g-portugal", "me", ["me", "p-rachel"], 1782302400000);
  addEqual("e-pt-103", "Uber to Airport", 4212, "transport", "2026-06-24", "g-portugal", "me", ["me", "p-rachel"], 1782302400000);

  const newYork = ["me", "p-bijan"];
  addWanderlog("e-ny-001", "Porter Airlines 2121", 521.76, "CAD", "travel", "2026-06-25", "g-new-york", newYork);
  addWanderlog("e-ny-002", "Newark Liberty International Airport", 49.16, "CAD", "transport", "2026-06-25", "g-new-york", newYork);
  addWanderlog("e-ny-003", "Liberty Bagels Midtown", 15.36, "CAD", "food", "2026-06-25", "g-new-york", newYork);
  addWanderlog("e-ny-004", "Transit", 4.28, "CAD", "transport", "2026-06-25", "g-new-york", newYork);
  addWanderlog("e-ny-005", "New Jersey", 7.55, "CAD", "transport", "2026-06-25", "g-new-york", newYork);
  addWanderlog("e-ny-006", "Monster", 6.20, "CAD", "food", "2026-06-25", "g-new-york", newYork);
  addWanderlog("e-ny-007", "Casa Adela", 55, "USD", "food", "2026-06-25", "g-new-york", newYork);
  addWanderlog("e-ny-008", "Joe's Pizza", 14.50, "USD", "food", "2026-06-25", "g-new-york", newYork);
  addWanderlog("e-ny-009", "NJ to NYC", 5.84, "CAD", "transport", "2026-06-26", "g-new-york", newYork);
  addWanderlog("e-ny-010", "Halo Deli", 17.59, "CAD", "food", "2026-06-26", "g-new-york", newYork);
  addWanderlog("e-ny-011", "Central Park Cafe", 27.01, "CAD", "food", "2026-06-26", "g-new-york", newYork);
  addWanderlog("e-ny-012", "Mahmoud's Corner Halal Food Cart", 24.76, "CAD", "food", "2026-06-26", "g-new-york", newYork);
  addWanderlog("e-ny-013", "Water", 1.59, "CAD", "food", "2026-06-26", "g-new-york", newYork);
  addWanderlog("e-ny-014", "Transit", 5.84, "CAD", "transport", "2026-06-26", "g-new-york", newYork);
  addWanderlog("e-ny-015", "Transit", 4.26, "CAD", "transport", "2026-06-26", "g-new-york", newYork);
  addWanderlog("e-ny-016", "Transit", 4.26, "CAD", "transport", "2026-06-26", "g-new-york", newYork);
  addWanderlog("e-ny-017", "Liberty Bagels Midtown", 23.21, "CAD", "food", "2026-06-27", "g-new-york", newYork);
  addWanderlog("e-ny-018", "Bertoni Gelato", 14.70, "CAD", "food", "2026-06-27", "g-new-york", newYork);
  addWanderlog("e-ny-019", "Transit", 5.84, "CAD", "transport", "2026-06-27", "g-new-york", newYork);
  addWanderlog("e-ny-020", "Dumbo Market", 6.24, "CAD", "groceries", "2026-06-27", "g-new-york", newYork);
  addWanderlog("e-ny-021", "Transit", 4.26, "CAD", "transport", "2026-06-28", "g-new-york", newYork);
  addWanderlog("e-ny-022", "Transit", 7.53, "CAD", "transport", "2026-06-28", "g-new-york", newYork);

  const peru = ["me", "p-rachel"];
  const peruItems: Array<[string, string, number, "CAD" | "PEN" | "USD", AppState["expenses"][number]["category"], string]> = [
    ["e-peru-001", "Toronto Pearson International Airport", 1813.82, "CAD", "travel", "2026-07-11"],
    ["e-peru-002", "Samay Wasi Youth Hostels Cusco", 75.88, "CAD", "travel", "2026-07-11"],
    ["e-peru-003", "Food", 20, "PEN", "food", "2026-07-12"],
    ["e-peru-004", "Nhihad's Sweaters", 100, "PEN", "shopping", "2026-07-12"],
    ["e-peru-005", "Rachel's Sweater", 120, "PEN", "shopping", "2026-07-12"],
    ["e-peru-006", "Tourist Ticket", 112, "CAD", "entertainment", "2026-07-12"],
    ["e-peru-007", "Taco Cusco", 50, "PEN", "food", "2026-07-12"],
    ["e-peru-008", "Chocolate", 4.46, "CAD", "general", "2026-07-12"],
    ["e-peru-009", "Casa Inka B&B", 45, "CAD", "travel", "2026-07-13"],
    ["e-peru-010", "Empanadas", 9, "PEN", "food", "2026-07-13"],
    ["e-peru-011", "Wristband", 3, "PEN", "shopping", "2026-07-13"],
    ["e-peru-012", "Inti-Restaurant Pizzeria Ollantaytambo", 15, "PEN", "food", "2026-07-13"],
    ["e-peru-013", "Maras", 40, "PEN", "entertainment", "2026-07-13"],
    ["e-peru-014", "Water", 5, "PEN", "food", "2026-07-13"],
    ["e-peru-015", "Nina del Valle", 88, "PEN", "food", "2026-07-13"],
    ["e-peru-016", "Hotel INKA'S LAND", 53.46, "CAD", "travel", "2026-07-14"],
    ["e-peru-017", "Ollantaytambo rail", 255.50, "CAD", "transport", "2026-07-14"],
    ["e-peru-018", "Brownie", 7, "PEN", "food", "2026-07-14"],
    ["e-peru-019", "Water", 8, "PEN", "food", "2026-07-14"],
    ["e-peru-020", "El Museo de La Papa Restaurante", 22.15, "PEN", "food", "2026-07-14"],
    ["e-peru-021", "Andean Organica Ollantaytambo", 32.05, "PEN", "food", "2026-07-14"],
    ["e-peru-022", "Rachel's Shawl", 45, "PEN", "shopping", "2026-07-14"],
    ["e-peru-023", "Historic Sanctuary of Machu Picchu", 132.30, "CAD", "entertainment", "2026-07-15"],
    ["e-peru-024", "Aguas Calientes rail", 255.50, "CAD", "transport", "2026-07-15"],
    ["e-peru-025", "Samay Wasi Youth Hostels Cusco", 154.39, "CAD", "travel", "2026-07-15"],
    ["e-peru-026", "Mapacho Craft Beer Restaurant", 61.50, "CAD", "food", "2026-07-15"],
    ["e-peru-027", "Bus to Machu Picchu", 48, "USD", "transport", "2026-07-15"],
    ["e-peru-028", "Tour Guide for Machu Picchu", 130, "PEN", "entertainment", "2026-07-15"],
    ["e-peru-029", "Central Coffee Shop", 10.45, "CAD", "food", "2026-07-15"],
    ["e-peru-030", "Arzobispado", 11.99, "CAD", "general", "2026-07-15"],
    ["e-peru-031", "Vinicunca", 239, "CAD", "entertainment", "2026-07-16"],
    ["e-peru-032", "Rainbow Mountain entrance fee", 60, "PEN", "entertainment", "2026-07-16"],
    ["e-peru-033", "Washrooms", 5, "PEN", "general", "2026-07-16"],
    ["e-peru-034", "Alpaca pictures", 8, "PEN", "entertainment", "2026-07-16"],
    ["e-peru-035", "Horseback riding", 150, "PEN", "entertainment", "2026-07-17"],
    ["e-peru-036", "Rachel's sweater", 180, "PEN", "shopping", "2026-07-17"],
    ["e-peru-037", "Hat", 15, "PEN", "shopping", "2026-07-17"],
    ["e-peru-038", "Jack's Cafe", 26.95, "CAD", "food", "2026-07-17"],
    ["e-peru-039", "Panzotis Italo Peruano Restaurant", 59.08, "CAD", "food", "2026-07-17"],
    ["e-peru-040", "Casa Market", 15.30, "CAD", "groceries", "2026-07-17"],
    ["e-peru-041", "Casa Market", 1.87, "CAD", "groceries", "2026-07-17"],
    ["e-peru-042", "Ausangate 7 Lagunas", 81.08, "CAD", "entertainment", "2026-07-18"],
    ["e-peru-043", "Lagunas entrance fee", 40, "PEN", "entertainment", "2026-07-18"],
    ["e-peru-044", "Horse ride for Rachel", 50, "PEN", "entertainment", "2026-07-18"],
    ["e-peru-045", "Film", 65, "PEN", "shopping", "2026-07-18"],
    ["e-peru-046", "ARTESANIAS ASUNTA", 45, "PEN", "shopping", "2026-07-18"],
    ["e-peru-047", "Pizzaria El Arriero", 48, "PEN", "food", "2026-07-18"],
    ["e-peru-048", "Arequipa Colca Canyon private transportation", 113.80, "CAD", "transport", "2026-07-19"],
    ["e-peru-049", "Hotel Friendly AQP", 45.60, "CAD", "travel", "2026-07-19"],
    ["e-peru-050", "Laundry", 24, "PEN", "general", "2026-07-19"],
    ["e-peru-051", "Taxi", 26, "PEN", "transport", "2026-07-19"],
    ["e-peru-052", "Empanada", 18, "PEN", "food", "2026-07-19"],
    ["e-peru-053", "Epicureo Restaurante", 33.03, "CAD", "food", "2026-07-19"],
    ["e-peru-054", "Jayari", 19.82, "CAD", "food", "2026-07-19"],
    ["e-peru-055", "Taxi", 19, "PEN", "transport", "2026-07-19"],
    ["e-peru-056", "Chocolate", 3.50, "PEN", "groceries", "2026-07-19"],
    ["e-peru-057", "Dbaos Peruvian & Asian Cuisine", 16.06, "CAD", "food", "2026-07-19"],
    ["e-peru-058", "HOTEL LOS PORTALES DE CHIVAY", 56, "CAD", "travel", "2026-07-20"],
    ["e-peru-059", "Buffet Chivay", 95, "PEN", "food", "2026-07-20"],
    ["e-peru-060", "COLCA TUSUY", 34.30, "CAD", "entertainment", "2026-07-20"],
    ["e-peru-061", "HCHOTELS Rivero520", 80, "USD", "travel", "2026-07-21"],
    ["e-peru-062", "Dbaos Peruvian & Asian Cuisine", 36.95, "CAD", "food", "2026-07-21"],
    ["e-peru-063", "Waya Lookout - Rooftop - Terraza", 55, "PEN", "entertainment", "2026-07-22"],
    ["e-peru-064", "Cathedral Museum", 20, "PEN", "entertainment", "2026-07-22"],
    ["e-peru-065", "Santa Catalina Monastery", 50, "PEN", "entertainment", "2026-07-22"],
    ["e-peru-066", "Walking tour", 40, "PEN", "entertainment", "2026-07-22"],
    ["e-peru-067", "Barrio Chifa", 20, "PEN", "food", "2026-07-22"],
    ["e-peru-068", "Water", 13, "PEN", "groceries", "2026-07-22"],
    ["e-peru-069", "Alpes Lima Kennedy Park", 66.83, "CAD", "travel", "2026-07-23"],
    ["e-peru-070", "Kafi Wasi Cafe Tostaduria", 20, "PEN", "food", "2026-07-23"],
    ["e-peru-071", "Taxi to Airport", 20, "PEN", "transport", "2026-07-23"],
    ["e-peru-072", "Taxi to Lima", 40, "PEN", "transport", "2026-07-23"],
    ["e-peru-073", "Popcorn", 6, "PEN", "food", "2026-07-23"],
    ["e-peru-074", "Mandil Taqueria Tex-Mex", 30.61, "CAD", "food", "2026-07-23"],
    ["e-peru-075", "Wong", 51, "PEN", "groceries", "2026-07-23"],
    ["e-peru-076", "Wild Rover Huacachina", 78.36, "CAD", "travel", "2026-07-24"],
    ["e-peru-077", "Peru Hop", 410.44, "CAD", "entertainment", "2026-07-24"],
    ["e-peru-078", "Coffee", 2.91, "CAD", "food", "2026-07-24"],
    ["e-peru-079", "Masks", 10, "PEN", "shopping", "2026-07-24"],
    ["e-peru-080", "Lunch at Pisco", 70, "PEN", "food", "2026-07-24"],
    ["e-peru-081", "Dinner pasta", 50, "PEN", "food", "2026-07-24"],
    ["e-peru-082", "Breakfast", 52, "PEN", "food", "2026-07-25"],
    ["e-peru-083", "Sand skiing", 210, "PEN", "entertainment", "2026-07-25"],
    ["e-peru-084", "Empanada", 16, "PEN", "food", "2026-07-25"],
    ["e-peru-085", "Alpes Lima Kennedy Park", 100, "PEN", "travel", "2026-07-25"],
    ["e-peru-086", "Taxi", 40, "PEN", "transport", "2026-07-26"],
  ];
  peruItems.forEach(([id, description, amount, currency, category, date]) =>
    addWanderlog(id, description, amount, currency, category, date, "g-peru", peru),
  );

  return addCentralAmericaTrip(state);
}
