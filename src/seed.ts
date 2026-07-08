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
      { id: "me", name: "You", email: "you@example.com", color: "#5BC5A7" },
      { id: "p-rachel", name: "Rachel", email: "rachel@example.com", color: "#8656CD" },
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

  return state;
}
