const fs = require("fs");

// 1) Fix FamilyTree prop
const ap = "D:/XiaomiMiMoProjects/laotagong/components/family-app.tsx";
let fa = fs.readFileSync(ap, "utf8");
if (!fa.includes("layoutMode={layoutMode}")) {
  fa = fa.replace(
    /<FamilyTree\r?\n(\s+)state=\{state\}\r?\n(\s+)focusId=\{focus\}/,
    "<FamilyTree\n$1state={state}\n$2focusId={focus}\n$2layoutMode={layoutMode}"
  );
}
fs.writeFileSync(ap, fa, "utf8");
console.log("app prop", fa.includes("layoutMode={layoutMode}"));

// 2) Rewrite clusterRankOf
const tp = "D:/XiaomiMiMoProjects/laotagong/lib/tree.ts";
let t = fs.readFileSync(tp, "utf8");
const start = t.indexOf("function clusterRankOf(");
const end = t.indexOf("function buildRoutes(");
if (start < 0 || end < 0) {
  console.log("markers", start, end);
  process.exit(1);
}
const fn = `function clusterRankOf(
  state: FamilyState,
  unitMembers: string[],
  meId: string | null,
  distances: Map<string, number | null>
): number {
  if (!meId || !state.persons[meId]) return 4;
  const mySpouses = new Set(
    state.spouses
      .filter((s) => s.a === meId || s.b === meId)
      .map((s) => (s.a === meId ? s.b : s.a))
  );

  const shareParents = (a: string, b: string) => {
    const pa = state.parents[a];
    const pb = state.parents[b];
    if (!pa || !pb) return false;
    return Boolean(
      (pa.fatherId && pa.fatherId === pb.fatherId) ||
        (pa.motherId && pa.motherId === pb.motherId)
    );
  };

  /** 是否「我」的后代（沿 parents 上溯能碰到 meId） */
  const isMeDescendant = (id: string): boolean => {
    if (id === meId) return false;
    const stack = [id];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const p = state.parents[cur];
      if (!p) continue;
      if (p.fatherId === meId || p.motherId === meId) return true;
      if (p.fatherId) stack.push(p.fatherId);
      if (p.motherId) stack.push(p.motherId);
    }
    return false;
  };

  const isSpouseOf = (id: string, personId: string) =>
    state.spouses.some(
      (s) => (s.a === id && s.b === personId) || (s.b === id && s.a === personId)
    );

  const myP = state.parents[meId];
  const myParentIds = [myP?.fatherId, myP?.motherId].filter(Boolean) as string[];

  const rankPerson = (id: string, depth = 0): number => {
    if (depth > 12) return 4;
    if (id === meId || mySpouses.has(id)) return 0;
    if (isMeDescendant(id)) return 0;
    // 我子女的配偶
    const parents = state.parents[id];
    if (parents) {
      if (
        (parents.fatherId === meId || parents.motherId === meId) &&
        state.spouses.some((s) => (s.a === id && isMeDescendant(s.b)) || (s.b === id && isMeDescendant(s.a)))
      ) {
        return 0;
      }
      // 与我后代结婚
      if (
        state.spouses.some((s) => {
          if (s.a !== id && s.b !== id) return false;
          const other = s.a === id ? s.b : s.a;
          return isMeDescendant(other) || other === meId || mySpouses.has(other);
        })
      ) {
        return 0;
      }
    }
    if (shareParents(meId, id)) return 1;
    // 我同胞的配偶
    if (isMeDescendant(id) === false) {
      for (const s of state.spouses) {
        const other = s.a === id ? s.b : s.b === id ? s.a : null;
        if (other && shareParents(meId, other) && isSpouseOf(id, other)) return 1;
      }
    }
    // 父母的同胞
    for (const pid of myParentIds) {
      if (shareParents(pid, id)) return 2;
    }
    // 配偶的同胞（妻兄弟姐妹等）
    for (const spId of mySpouses) {
      if (shareParents(spId, id)) return 3;
    }
    // 姻亲旁系的后代：父母任一方 rank>=3 则本人也是 3
    if (parents) {
      const pr = [parents.fatherId, parents.motherId]
        .filter((x): x is string => Boolean(x))
        .map((x) => rankPerson(x, depth + 1));
      if (pr.some((r) => r >= 3)) return 3;
      if (pr.some((r) => r === 2)) return 2;
      if (pr.some((r) => r === 1)) {
        // 父母同胞的子女：堂表，仍算偏旁系
        return 2;
      }
    }
    void distances;
    return 4;
  };

  let best = 4;
  for (const id of unitMembers) {
    best = Math.min(best, rankPerson(id));
  }
  return best;
}

`;
t = t.slice(0, start) + fn + t.slice(end);
fs.writeFileSync(tp, t, "utf8");
console.log("clusterRank rewritten", !t.includes("d >= 1"));

// 3) Strengthen cluster test
const test = `import { describe, expect, it } from "vitest";
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
`;
fs.writeFileSync("D:/XiaomiMiMoProjects/laotagong/test/cluster.ego.test.ts", test, "utf8");
console.log("test tightened");

// 4) escape HTML in tree-g6 node names
const g6p = "D:/XiaomiMiMoProjects/laotagong/components/tree-g6.tsx";
let g6 = fs.readFileSync(g6p, "utf8");
if (!g6.includes("escapeHtml")) {
  g6 = g6.replace(
    "function nodeHtml(",
    `function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function nodeHtml(`
  );
  g6 = g6.replace(
    "return nodeHtml(String(n.name ?? d?.id ?? \"\"), String(n.term ?? \"\"), String(n.color ?? \"#64748b\"));",
    "return nodeHtml(escapeHtml(String(n.name ?? d?.id ?? \"\")), escapeHtml(String(n.term ?? \"\")), String(n.color ?? \"#64748b\"));"
  );
}
fs.writeFileSync(g6p, g6, "utf8");
console.log("g6 escape", g6.includes("escapeHtml"));
