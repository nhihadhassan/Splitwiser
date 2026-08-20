import { describe, expect, it } from "vitest";
import { motifForGroup } from "./destinations";

describe("destination motif detection", () => {
  it("matches a group name against the generic gazetteer", () => {
    expect(motifForGroup("New York Weekend")).toBe("liberty");
    expect(motifForGroup("Peru Trek")).toBe("ruins-peak");
    expect(motifForGroup("Central America Loop")).toBe("volcano");
    expect(motifForGroup("Portugal Getaway")).toBe("rooster");
  });

  it("returns null when no destination keyword matches", () => {
    expect(motifForGroup("Cabin House")).toBeNull();
    expect(motifForGroup("")).toBeNull();
  });

  it("lets an explicit override win over name detection", () => {
    expect(motifForGroup("New York Weekend", "volcano")).toBe("volcano");
  });

  it("is case and accent insensitive", () => {
    expect(motifForGroup("PERÚ trip")).toBe("ruins-peak");
  });
});
