const fs = require("fs");
const t = (s) => s; // pass through
const ts = `import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { ancestorTerm, buildKinshipMap, kinshipTerm } from "@/lib/kinship";

function person(id: string, g: Person["gender"], y = ""): Person {
  return createPerson({ id, name: id, gender: g, birthYear: y, createdAt: 1 });
}

function fam(): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, g, y] of [
    ["PGF", "male", "1940"],
    ["PGM", "female", "1942"],
    ["MGF", "male", "1941"],
    ["MGM", "female", "1943"],
    ["F", "male", "1965"],
    ["M", "female", "1968"],
    ["UNCLE", "male", "1962"],
    ["ME", "male", "1990"],
    ["SIS", "female", "1993"],
    ["WIFE", "female", "1992"],
    ["WFATHER", "male", "1960"],
    ["WMOTHER", "female", "1962"],
    ["SON", "male", "2018"],
    ["DAUGHTER", "female", "2020"],
  ] as const) {
    persons[id] = person(id, g, y);
  }
  return {
    version: 1,
    persons,
    parents: {
      F: { fatherId: "PGF", motherId: "PGM" },
      UNCLE: { fatherId: "PGF", motherId: "PGM" },
      M: { fatherId: "MGF", motherId: "MGM" },
      ME: { fatherId: "F", motherId: "M" },
      SIS: { fatherId: "F", motherId: "M" },
      WIFE: { fatherId: "WFATHER", motherId: "WMOTHER" },
      SON: { fatherId: "ME", motherId: "WIFE" },
      DAUGHTER: { fatherId: "ME", motherId: "WIFE" },
    },
    spouses: [
      { a: "PGF", b: "PGM" },
      { a: "MGF", b: "MGM" },
      { a: "F", b: "M" },
      { a: "ME", b: "WIFE" },
      { a: "WFATHER", b: "WMOTHER" },
    ],
    meId: "ME",
  };
}

describe("ancestor terms", () => {
  it("path terms", () => {
    expect(ancestorTerm("F")).toBe("\\u7236\\u4eb2");
    expect(ancestorTerm("M")).toBe("\\u6bcd\\u4eb2");
    expect(ancestorTerm("FF")).toBe("\\u7956\\u7236");
    expect(ancestorTerm("FM")).toBe("\\u7956\\u6bcd");
    expect(ancestorTerm("MF")).toBe("\\u5916\\u7956\\u7236");
    expect(ancestorTerm("MM")).toBe("\\u5916\\u7956\\u6bcd");
    expect(ancestorTerm("FFF")).toBe("\\u66fe\\u7956\\u7236");
    expect(ancestorTerm("FMF")).toBe("\\u66fe\\u5916\\u7956\\u7236");
    expect(ancestorTerm("MFF")).toBe("\\u5916\\u66fe\\u7956\\u7236");
  });
});

describe("kinship map", () => {
  const state = fam();

  it("core terms", () => {
    expect(kinshipTerm(state, "ME", "ME")).toBe("\\u6211");
    expect(kinshipTerm(state, "F", "ME")).toBe("\\u7236\\u4eb2");
    expect(kinshipTerm(state, "PGM", "ME")).toBe("\\u7956\\u6bcd");
    expect(kinshipTerm(state, "WIFE", "ME")).toBe("\\u59bb\\u5b50");
    expect(kinshipTerm(state, "SON", "ME")).toBe("\\u513f\\u5b50");
    expect(kinshipTerm(state, "WMOTHER", "ME")).toBe("\\u4e08\\u6bcd\\u5a18");
    expect(kinshipTerm(state, "WFATHER", "ME")).toBe("\\u5cb3\\u7236");
  });

  it("female center in-laws", () => {
    const next = { ...state, meId: "WIFE" };
    expect(kinshipTerm(next, "M", "WIFE")).toBe("\\u5a46\\u5a46");
    expect(kinshipTerm(next, "F", "WIFE")).toBe("\\u516c\\u516c");
    expect(kinshipTerm(next, "ME", "WIFE")).toBe("\\u4e08\\u592b");
    expect(kinshipTerm(next, "WMOTHER", "WIFE")).toBe("\\u6bcd\\u4eb2");
  });

  it("buildKinshipMap", () => {
    const map = buildKinshipMap(state, "ME");
    expect(map.get("WMOTHER")).toBe("\\u4e08\\u6bcd\\u5a18");
    expect(map.size).toBe(Object.keys(state.persons).length);
  });
});
`;
fs.writeFileSync("D:/XiaomiMiMoProjects/laotagong/test/kinship.test.ts", ts, "utf8");
console.log("test written");
