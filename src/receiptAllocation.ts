import type { ReceiptParticipantAllocation } from "./types";

/** Exact deterministic allocation: sort ties by participant id and award the
 * remaining minor units in that order. This never loses or creates a cent. */
export function distributeProportionally(
  amountMinor: number,
  weights: Array<{ personId: string; weight: number }>,
): ReceiptParticipantAllocation[] {
  if (!Number.isInteger(amountMinor) || weights.length === 0 || weights.some((item) => !Number.isInteger(item.weight) || item.weight < 0)) throw new Error("Allocation inputs are invalid.");
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) throw new Error("Allocation needs at least one assigned item.");
  const sign = amountMinor < 0 ? -1 : 1;
  const absolute = Math.abs(amountMinor);
  const base = weights.map((item) => ({ personId: item.personId, amountMinor: Math.floor((absolute * item.weight) / totalWeight), remainder: (absolute * item.weight) % totalWeight }));
  let remaining = absolute - base.reduce((sum, item) => sum + item.amountMinor, 0);
  base.sort((a, b) => b.remainder - a.remainder || a.personId.localeCompare(b.personId));
  for (let index = 0; index < base.length && remaining > 0; index += 1, remaining -= 1) base[index].amountMinor += 1;
  return base.sort((a, b) => a.personId.localeCompare(b.personId)).map(({ personId, amountMinor }) => ({ personId, amountMinor: amountMinor * sign }));
}

export function allocationTotal(allocations: ReceiptParticipantAllocation[]): number {
  return allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
}
