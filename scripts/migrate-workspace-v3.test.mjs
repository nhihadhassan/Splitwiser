import { describe, expect, it } from "vitest";
import { seedState } from "../src/seed.ts";
import { assertManifest, preservationManifest, validateState } from "./migrate-workspace-v3.mjs";

describe("workspace v3 migration preservation", () => {
  it("captures record counts, group totals, reconciliation records, and a checksum", () => {
    const state = seedState();
    validateState(state);
    const manifest = preservationManifest(state);
    expect(manifest.counts).toMatchObject({ people: 3, groups: 3, expenses: 9, settlements: 1 });
    expect(Object.keys(manifest.totals.groupExpenseCents)).toEqual(["group-coast", "group-cabin", "group-city"]);
    expect(manifest.stateSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the checksum when a cent changes", () => {
    const original = seedState();
    const changed = structuredClone(original);
    changed.expenses[0].amount += 1;
    changed.expenses[0].splits[0].owes += 1;
    changed.expenses[0].splits[0].paid += 1;
    expect(preservationManifest(changed).stateSha256).not.toBe(preservationManifest(original).stateSha256);
  });

  it("stops on a manifest mismatch", () => {
    const manifest = preservationManifest(seedState());
    expect(() => assertManifest(manifest, { ...manifest, stateSha256: "0".repeat(64) })).toThrow(/mismatch/i);
  });

  it("rejects a ledger with unbalanced cent totals", () => {
    const state = seedState();
    state.expenses[0].splits[0].owes += 1;
    expect(() => validateState(state)).toThrow(/balance exactly/i);
  });
});
