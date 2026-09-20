import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { layoutFamilyTree } from "@/lib/tree";

function person(id: string, g: Person["gender"], y = ""): Person {
  return createPerson({ id, name: id, gender: g, birthYear: y, createdAt: 1 });
}

function mixedAffinalFamily(): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, g, y] of [
    ["WGF", "male", "1960"],
    ["WGM", "female", "1962"],
    ["ME", "male", "1990"],
    ["WIFE", "female", "1992"],
    ["SIS_IN_LAW", "female", "1994"],
    ["SIL_HUSBAND", "male", "1993"],
    ["MY_SON", "male", "2018"],
    ["MY_DAU", "female", "2020"],
    ["SIL_SON", "male", "2019"],
    ["SIL_DAU", "female", "2021"],
  ] as const) {
    persons[id] = person(id, g, y);
  }
  return {
    version: 1,
    persons,
    parents: {
      WIFE: { fatherId: "WGF", motherId: "WGM" },
      SIS_IN_LAW: { fatherId: "WGF", motherId: "WGM" },
      MY_SON: { fatherId: "ME", motherId: "WIFE" },
      MY_DAU: { fatherId: "ME", motherId: "WIFE" },
      SIL_SON: { fatherId: "SIL_HUSBAND", motherId: "SIS_IN_LAW" },
      SIL_DAU: { fatherId: "SIL_HUSBAND", motherId: "SIS_IN_LAW" },
    },
    spouses: [
      { a: "ME", b: "WIFE" },
      { a: "SIL_HUSBAND", b: "SIS_IN_LAW" },
      { a: "WGF", b: "WGM" },
    ],
    meId: "ME",
  };
}

describe("ego-centric generation clustering", () => {
  const layout = layoutFamilyTree(mixedAffinalFamily());
  const me = layout.byId.get("ME")!;

  it("keeps all nodes", () => {
    expect(layout.byId.size).toBe(10);
  });

  it("my children are closer to ME.x than affinal nephews", () => {
    const myKids = ["MY_SON", "MY_DAU"].map((id) => layout.byId.get(id)!);
    const silKids = ["SIL_SON", "SIL_DAU"].map((id) => layout.byId.get(id)!);
    const myDist = Math.min(
      ...myKids.map((k) => Math.abs(k.x + k.width / 2 - (me.x + me.width / 2)))
    );
    const silDist = Math.min(
      ...silKids.map((k) => Math.abs(k.x + k.width / 2 - (me.x + me.width / 2)))
    );
    expect(myDist).toBeLessThan(silDist);
  });

  it("my children and in-law children do not interleave; positive gap", () => {
    const mine = ["MY_SON", "MY_DAU"]
      .map((id) => layout.byId.get(id)!)
      .sort((a, b) => a.x - b.x);
    const theirs = ["SIL_SON", "SIL_DAU"]
      .map((id) => layout.byId.get(id)!)
      .sort((a, b) => a.x - b.x);
    const myMin = Math.min(...mine.map((n) => n.x));
    const myMax = Math.max(...mine.map((n) => n.x + n.width));
    const theirMin = Math.min(...theirs.map((n) => n.x));
    const theirMax = Math.max(...theirs.map((n) => n.x + n.width));
    const interleaved = !(myMax <= theirMin || theirMax <= myMin);
    expect(interleaved).toBe(false);
    // spec: must have a visible gap between the two groups
    const gap = myMax <= theirMin ? theirMin - myMax : myMin - theirMax;
    expect(gap).toBeGreaterThan(8);
  });
});
