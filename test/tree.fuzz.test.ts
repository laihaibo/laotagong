import { describe, expect, it } from "vitest";

import {
  addParentLink,
  addSpouseLink,
  createPerson,
  linkChildWithParents,
  type FamilyState,
  type Gender,
  type Person,
} from "@/lib/family";
import { layoutFamilyTree } from "@/lib/tree";

/** 可复现的伪随机 */
let seed = 42;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function newId() {
  return `id-${Math.floor(rnd() * 1e12).toString(36)}-${Math.floor(rnd() * 1e9).toString(36)}`;
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/** 模拟 UI 的添加关系（与 family-app.tsx 的 RELATION_APPLIERS 一致） */
function applyAdd(
  state: FamilyState,
  mode: "father" | "mother" | "spouse" | "child",
  focusId: string,
  personId: string
): FamilyState {
  if (mode === "father") return addParentLink(state, focusId, personId, "father");
  if (mode === "mother") return addParentLink(state, focusId, personId, "mother");
  if (mode === "spouse") return addSpouseLink(state, focusId, personId);
  return linkChildWithParents(state, personId, focusId);
}

describe("模糊测试：连续添加家庭成员，每步都不得出现卡片相交", () => {
  it("300 轮 × 25 步随机添加", () => {
    seed = 42;
    const failures: string[] = [];

    for (let round = 0; round < 300; round++) {
      let state: FamilyState = {
        version: 1,
        persons: {},
        parents: {},
        spouses: [],
        meId: null,
      };
      const me = createPerson({ id: newId(), name: "我", gender: "male", createdAt: 1 });
      state = { ...state, persons: { [me.id]: me }, meId: me.id };
      const ids = [me.id];
      let bad = "";

      const assertClean = (step: number, mode: string) => {
        const layout = layoutFamilyTree(state);
        for (let i = 0; i < layout.nodes.length && !bad; i++) {
          for (let j = i + 1; j < layout.nodes.length; j++) {
            const a = layout.nodes[i];
            const b = layout.nodes[j];
            if (intersects(a, b)) {
              bad = `round ${round} 第 ${step} 步（为 ${state.persons[ids[Math.floor(rnd() * ids.length)]]?.name ?? "?"} 加 ${mode}）后：${state.persons[a.id]?.name ?? a.id}(x=${a.x.toFixed(1)},y=${a.y},g=${a.generation}) 与 ${state.persons[b.id]?.name ?? b.id}(x=${b.x.toFixed(1)},y=${b.y},g=${b.generation}) 相交`;
              break;
            }
          }
        }
      };

      assertClean(0, "init");
      for (let op = 0; op < 25 && !bad; op++) {
        const mode = pick(["father", "mother", "spouse", "child", "child", "spouse"]) as
          | "father"
          | "mother"
          | "spouse"
          | "child";
        const focusId = pick(ids);
        const np: Person = createPerson({
          id: newId(),
          name: `P${round}_${op}`,
          gender: pick(["male", "female", "unknown"]) as Gender,
          birthYear: rnd() < 0.5 ? String(1930 + Math.floor(rnd() * 90)) : "",
          createdAt: 1,
        });
        state = { ...state, persons: { ...state.persons, [np.id]: np } };
        ids.push(np.id);
        state = applyAdd(state, mode, focusId, np.id);
        assertClean(op + 1, mode);
      }
      if (bad) failures.push(bad);
    }

    expect(failures, failures.slice(0, 5).join("\n")).toHaveLength(0);
  });
});
