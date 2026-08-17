import type { AppState, Expense, Settlement } from "../types";
import { splitByWeights } from "./money";

/**
 * Pairwise ledger: ledger[a][b] = cents that `a` owes `b` (net, >= 0 on one
 * side of each pair only).
 */
export type PairwiseLedger = Map<string, Map<string, number>>;

function addDebt(ledger: PairwiseLedger, from: string, to: string, cents: number) {
  if (from === to || cents === 0) return;
  // net against any existing opposite debt first
  const reverse = ledger.get(to)?.get(from) ?? 0;
  if (reverse > 0) {
    const cancelled = Math.min(reverse, cents);
    setDebt(ledger, to, from, reverse - cancelled);
    cents -= cancelled;
  }
  if (cents > 0) {
    setDebt(ledger, from, to, (ledger.get(from)?.get(to) ?? 0) + cents);
  }
}

function setDebt(ledger: PairwiseLedger, from: string, to: string, cents: number) {
  let row = ledger.get(from);
  if (!row) {
    row = new Map();
    ledger.set(from, row);
  }
  if (cents === 0) row.delete(to);
  else row.set(to, cents);
}

function applyExpense(ledger: PairwiseLedger, expense: Expense) {
  // Each participant's net position on this expense is paid - owed.
  // Debtors (net < 0) owe creditors (net > 0), allocated proportionally.
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];
  for (const split of expense.splits) {
    const net = split.paid - split.owes;
    if (net > 0) creditors.push({ id: split.personId, amount: net });
    else if (net < 0) debtors.push({ id: split.personId, amount: -net });
  }
  for (const debtor of debtors) {
    const portions = splitByWeights(
      debtor.amount,
      creditors.map((c) => c.amount),
    );
    creditors.forEach((creditor, i) => {
      addDebt(ledger, debtor.id, creditor.id, portions[i]);
    });
  }
}

function applySettlement(ledger: PairwiseLedger, settlement: Settlement) {
  // paying someone reduces your debt to them (or makes them owe you)
  addDebt(ledger, settlement.toId, settlement.fromId, settlement.amount);
}

/** Build the pairwise ledger for a scope (a group, non-group only, or everything). */
export function buildLedger(
  state: AppState,
  scope: { groupId?: string | null } = {},
): PairwiseLedger {
  const ledger: PairwiseLedger = new Map();
  const inScope = (groupId: string | null) =>
    scope.groupId === undefined ? true : groupId === scope.groupId;
  for (const expense of state.expenses) {
    if (inScope(expense.groupId)) applyExpense(ledger, expense);
  }
  for (const settlement of state.settlements) {
    if (inScope(settlement.groupId)) applySettlement(ledger, settlement);
  }
  return ledger;
}

/** Net balance per person: positive = is owed money, negative = owes money. */
export function netBalances(ledger: PairwiseLedger): Map<string, number> {
  const net = new Map<string, number>();
  for (const [from, row] of ledger) {
    for (const [to, cents] of row) {
      net.set(from, (net.get(from) ?? 0) - cents);
      net.set(to, (net.get(to) ?? 0) + cents);
    }
  }
  return net;
}

/** How much `a` owes `b` net (negative means b owes a). */
export function pairBalance(ledger: PairwiseLedger, a: string, b: string): number {
  return (ledger.get(a)?.get(b) ?? 0) - (ledger.get(b)?.get(a) ?? 0);
}

/**
 * Balance between `me` and every other person across the whole ledger:
 * positive = they owe me.
 */
export function balancesWith(ledger: PairwiseLedger, me: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const [from, row] of ledger) {
    for (const [to, cents] of row) {
      if (from === me) result.set(to, (result.get(to) ?? 0) - cents);
      if (to === me) result.set(from, (result.get(from) ?? 0) + cents);
    }
  }
  return result;
}

export interface SimplifiedDebt {
  fromId: string;
  toId: string;
  amount: number;
}

/**
 * Splitwise's "simplify debts": reduce the ledger to the minimal set of
 * payments that settles everyone's net balance (greedy max-creditor /
 * max-debtor matching).
 */
export function simplifyDebts(ledger: PairwiseLedger): SimplifiedDebt[] {
  const net = netBalances(ledger);
  const creditors = [...net.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, amount: v }));
  const debtors = [...net.entries()]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amount: -v }));
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const result: SimplifiedDebt[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > 0) result.push({ fromId: debtor.id, toId: creditor.id, amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }
  return result;
}

/** The raw (unsimplified) debt list from a ledger. */
export function rawDebts(ledger: PairwiseLedger): SimplifiedDebt[] {
  const result: SimplifiedDebt[] = [];
  for (const [from, row] of ledger) {
    for (const [to, amount] of row) {
      if (amount > 0) result.push({ fromId: from, toId: to, amount });
    }
  }
  return result;
}
