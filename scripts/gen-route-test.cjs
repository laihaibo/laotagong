const fs = require("fs");
const ts = `import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { layoutFamilyTree } from "@/lib/tree";

function person(id: string, g: Person["gender"], y = ""): Person {
  return createPerson({ id, name: id, gender: g, birthYear: y, createdAt: 1 });
}

function parsePathPoints(d: string): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const re = /([MLHV])\\s*([^MLHV]+)/gi;
  let m: RegExpExecArray | null;
  let cx = 0;
  let cy = 0;
  while ((m = re.exec(d))) {
    const cmd = m[1].toUpperCase();
    const nums = m[2].trim().split(/[\\s,]+/).map(Number);
    if (cmd === "M" || cmd === "L") {
      cx = nums[0];
      cy = nums[1];
      pts.push({ x: cx, y: cy });
    } else if (cmd === "H") {
      cx = nums[0];
      pts.push({ x: cx, y: cy });
    } else if (cmd === "V") {
      cy = nums[0];
      pts.push({ x: cx, y: cy });
    }
  }
  return pts;
}

function inBox(
  p: { x: number; y: number },
  n: { x: number; y: number; width: number; height: number },
  pad = 1
): boolean {
  return (
    p.x >= n.x - pad &&
    p.x <= n.x + n.width + pad &&
    p.y >= n.y - pad &&
    p.y <= n.y + n.height + pad
  );
}

describe("??????", () => {
  const persons: Record<string, Person> = {};
  for (const [id, g, y] of [
    ["PGF", "male", "1940"],
    ["PGM", "female", "1942"],
    ["MGF", "male", "1941"],
    ["MGM", "female", "1943"],
    ["F", "male", "1965"],
    ["M", "female", "1968"],
    ["ME", "male", "1990"],
    ["WIFE", "female", "1992"],
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
      { a: "ME", b: "WIFE" },
    ],
    meId: "ME",
  };
  const layout = layoutFamilyTree(state);

  it("???????? blood ??", () => {
    const ids = layout.routes.filter((r) => r.kind === "blood").map((r) => r.id);
    expect(ids).toContain("r:PGF>F");
    expect(ids).toContain("r:PGM>F");
    expect(ids).toContain("r:MGF>M");
    expect(ids).toContain("r:MGM>M");
    expect(ids).toContain("r:F>ME");
    expect(ids).toContain("r:M>ME");
  });

  it("???????????????????", () => {
    for (const r of layout.routes.filter((x) => x.kind === "blood")) {
      const from = layout.byId.get(r.fromId)!;
      const to = layout.byId.get(r.toId)!;
      expect(r.start.y).toBeCloseTo(from.y + from.height, 0);
      expect(r.start.x).toBeGreaterThanOrEqual(from.x - 2);
      expect(r.start.x).toBeLessThanOrEqual(from.x + from.width + 2);
      expect(r.end.y).toBeCloseTo(to.y, 0);
      expect(r.end.x).toBeGreaterThanOrEqual(to.x - 2);
      expect(r.end.x).toBeLessThanOrEqual(to.x + to.width + 2);
    }
  });

  it("????????????????????????", () => {
    for (const r of layout.routes.filter((x) => x.kind === "blood")) {
      const pts = parsePathPoints(r.d);
      expect(pts.length).toBeGreaterThanOrEqual(2);
      expect(pts[0].x).toBeCloseTo(r.start.x, 0);
      expect(pts[0].y).toBeCloseTo(r.start.y, 0);
      const last = pts[pts.length - 1];
      expect(last.x).toBeCloseTo(r.end.x, 0);
      expect(last.y).toBeCloseTo(r.end.y, 0);
    }
  });

  it("?????????????", () => {
    const m = layout.byId.get("M")!;
    for (const id of ["r:PGF>F", "r:PGM>F"]) {
      const r = layout.routes.find((x) => x.id === id)!;
      for (const p of parsePathPoints(r.d)) {
        expect(inBox(p, m), id + " touches M at " + p.x + "," + p.y).toBe(false);
      }
    }
  });

  it("?????????????", () => {
    const f = layout.byId.get("F")!;
    for (const id of ["r:MGF>M", "r:MGM>M"]) {
      const r = layout.routes.find((x) => x.id === id)!;
      for (const p of parsePathPoints(r.d)) {
        expect(inBox(p, f), id + " touches F at " + p.x + "," + p.y).toBe(false);
      }
    }
  });

  it("??????????????????????", () => {
    const pat = parsePathPoints(layout.routes.find((r) => r.id === "r:PGF>F")!.d);
    const mat = parsePathPoints(layout.routes.find((r) => r.id === "r:MGF>M")!.d);
    // ??????? x ????????
    const patMax = Math.max(...pat.map((p) => p.x));
    const matMin = Math.min(...mat.map((p) => p.x));
    expect(patMax).toBeLessThan(matMin + 1);
  });
});
`;
fs.writeFileSync("D:/XiaomiMiMoProjects/laotagong/test/routes.geometry.test.ts", ts, "utf8");
console.log("test written");
