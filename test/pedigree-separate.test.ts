import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { layoutFamilyTree } from "@/lib/tree";

function person(id: string, g: Person["gender"], y = ""): Person {
  return createPerson({ id, name: id, gender: g, birthYear: y, createdAt: 1 });
}

describe("父母双方祖辈物理分侧", () => {
  const persons: Record<string, Person> = {};
  for (const [id, g, y] of [
    ["PGF", "male", "1940"],
    ["PGM", "female", "1942"],
    ["MGF", "male", "1941"],
    ["MGM", "female", "1943"],
    ["F", "male", "1965"],
    ["M", "female", "1968"],
    ["ME", "male", "1990"],
  ] as const) {
    persons[id] = person(id, g, y);
  }
  const state: FamilyState = {
    version: 1,
    persons,
    parents: {
      F: { fatherId: "PGF", motherId: "PGM" },
      M: { fatherId: "MGF", motherId: "MGM" },
      ME: { fatherId: "F", motherId: "M" },
    },
    spouses: [
      { a: "PGF", b: "PGM" },
      { a: "MGF", b: "MGM" },
      { a: "F", b: "M" },
    ],
    meId: "ME",
  };
  const layout = layoutFamilyTree(state);

  it("父系祖辈在左，母系祖辈在右", () => {
    const pgf = layout.byId.get("PGF")!;
    const mgf = layout.byId.get("MGF")!;
    expect(pgf.x + pgf.width).toBeLessThanOrEqual(mgf.x + 1);
  });

  it("父亲在左，母亲在右", () => {
    const f = layout.byId.get("F")!;
    const m = layout.byId.get("M")!;
    expect(f.x).toBeLessThan(m.x);
  });

  it("通往父亲的血亲线整体在通往母亲的血亲线左侧", () => {
    const toF = layout.routes.filter((r) => r.kind === "blood" && r.toId === "F");
    const toM = layout.routes.filter((r) => r.kind === "blood" && r.toId === "M");
    expect(toF.length).toBeGreaterThan(0);
    expect(toM.length).toBeGreaterThan(0);
    const fMax = Math.max(...toF.flatMap((r) => [r.start.x, r.end.x]));
    const mMin = Math.min(...toM.flatMap((r) => [r.start.x, r.end.x]));
    expect(fMax).toBeLessThan(mMin + 1);
  });

  it("卡片均有称呼字段可展示（layout 不关心称呼，此处仅保证全员入图）", () => {
    expect(layout.byId.size).toBe(7);
  });
});
