import type { CashTransaction } from "./types";

export const DEFAULT_PERU_CASH_TRANSACTIONS: CashTransaction[] = [
  { id: "cash-prior", date: "Before Jul 12", description: "Previous cash withdrawal", detail: "500 PEN cash received", amount: 212.00 },
  { id: "cash-jul-12-1", date: "Jul 12, 2026", description: "International ABM withdrawal", detail: "ESQ. Av. El Sol y Almagro, Cusco", amount: 171.22 },
  { id: "cash-jul-12-2", date: "Jul 12, 2026", description: "International ABM withdrawal", detail: "SBP, Av. El Sol, Cusco", amount: 85.61 },
  { id: "cash-jul-12-fee", date: "Jul 12, 2026", description: "ABM network usage charge", detail: "International ATM fee", amount: 3.00 },
  { id: "cash-jul-15", date: "Jul 15, 2026", description: "International ABM withdrawal", detail: "SBP, Av. El Sol, Cusco", amount: 170.08 },
  { id: "cash-jul-17", date: "Jul 17, 2026", description: "International ABM withdrawal", detail: "SBP, Av. El Sol, Cusco", amount: 169.98 },
  { id: "cash-jul-18", date: "Jul 18, 2026", description: "International ABM withdrawal", detail: "SBP, Av. El Sol, Cusco", amount: 169.26 },
  { id: "cash-jul-19", date: "Jul 19, 2026", description: "International ABM withdrawal", detail: "SBP, Ag. Mercaderes, Cusco", amount: 169.26 },
  { id: "cash-jul-21", date: "Jul 21, 2026", description: "International ABM withdrawal", detail: "SBP, Ag. Mercaderes, Arequipa", amount: 170.40 },
  { id: "cash-jul-22", date: "Jul 22, 2026", description: "International ABM withdrawal", detail: "SBP, CSF Arequipa", amount: 170.40 },
  { id: "cash-jul-23", date: "Jul 23, 2026", description: "International ABM withdrawal", detail: "SBP, Ag. Diagonal 2, Lima", amount: 170.23 },
  { id: "cash-jul-26", date: "Jul 26, 2026", description: "International ABM withdrawal", detail: "SBP, Larco II, Lima", amount: 21.25 },
];
