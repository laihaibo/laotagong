import { describe, expect, it } from "vitest";

import {
  getChildrenIds,
  getCoParentIds,
  getRelationDistances,
  getSpouseIds,
  type FamilyState,
  type Person,
} from "@/lib/family";
import {
  ancestorClosure,
  bfsDistances,
  buildChildIndex,
  buildGraphIndexes,
  childrenOf,
  coParentsOf,
  descendantSetOf,
  shareAParent,
  spousesOf,
} from "@/lib/graph";
import { computeDistances, isBloodDescendant } from "@/lib/lineage";
import { createPerson } from "@/lib/family";

/**
 * lib/graph.ts 的守卫。这些遍历是布局、称谓、五服的共同底层，
 * 关键性质：**索引版查询与 family.ts 的线性扫描版同序同果**，
 * 以及 **descendantSetOf 与 isBloodDescendant 逐人等价**。
 */

function person(id: string, gender: Person["gender"] = "male"): Person {
  return createPerson({ id, name: id, gender, createdAt: 1 });
}

/** 三代 + 双配偶 + 岳家 + 一支未连通分支的固定谱 */
function mixedFamily(): FamilyState {
  const ids = [
    "GF", "GM", "GM2", "F", "M", "ME", "W", "S", "D",
    "WF", "WM", "OS", "ISO",
  ];
  const persons: Record<string, Person> = {};
  for (const id of ids) {
    persons[id] = person(id, id === "GM" || id === "GM2" || id === "M" || id === "W" || id === "WM" || id === "D" ? "female" : "male");
  }
  return {
    version: 1,
    persons,
    parents: {
      F: { fatherId: "GF", motherId: "GM" },
      ME: { fatherId: "F", motherId: "M" },
      S: { fatherId: "ME", motherId: "W" },
      D: { fatherId: "ME", motherId: "W" },
      W: { fatherId: "WF", motherId: "WM" },
    },
    // F 有两位配偶（GM2 是继亲）；ISO 与「我」不连通
    spouses: [
      { a: "GF", b: "GM" },
      { a: "GF", b: "GM2" },
      { a: "F", b: "M" },
      { a: "ME", b: "W" },
    ],
    meId: "ME",
  };
}

describe("graph 索引 · 与 family.ts 线性扫描同序同果", () => {
  it("childrenOf 与 getChildrenIds 逐位一致", () => {
    const state = mixedFamily();
    const childIndex = buildChildIndex(state);
    for (const id of Object.keys(state.persons)) {
      expect(childrenOf(id, childIndex)).toEqual(getChildrenIds(state, id));
    }
  });

  it("spousesOf 与 getSpouseIds 逐位一致（含多配偶顺序）", () => {
    const state = mixedFamily();
    const { spouseIndex } = buildGraphIndexes(state);
    for (const id of Object.keys(state.persons)) {
      expect(spousesOf(id, spouseIndex)).toEqual(getSpouseIds(state, id));
    }
  });

  it("coParentsOf 与 getCoParentIds 逐位一致", () => {
    const state = mixedFamily();
    const childIndex = buildChildIndex(state);
    for (const id of Object.keys(state.persons)) {
      expect(coParentsOf(state, id, childIndex)).toEqual(getCoParentIds(state, id));
    }
  });
});

describe("bfsDistances · 混合图距离", () => {
  it("语义抽查：血亲按跳数、配偶权重 0、姻亲经配偶边连通、未连通为 null", () => {
    const state = mixedFamily();
    const fast = getRelationDistances(state);

    // 直系血亲：父 −1、祖 −2
    expect(fast.get("F")).toBe(-1);
    expect(fast.get("M")).toBe(-1);
    expect(fast.get("GF")).toBe(-2);
    expect(fast.get("GM")).toBe(-2);
    // 配偶边权重 0
    expect(fast.get("W")).toBe(0);
    // 子女 +1
    expect(fast.get("S")).toBe(1);
    expect(fast.get("D")).toBe(1);
    // 岳父母经配偶边连通（W 的父母）
    expect(fast.get("WF")).toBe(-1);
    expect(fast.get("WM")).toBe(-1);
    // 继亲（GF 的另一位配偶）与未连通分支
    expect(fast.get("GM2")).toBe(-2);
    expect(fast.get("ISO")).toBe(null);
  });

  it("lineage.computeDistances 与 family.getRelationDistances 同源同果", () => {
    const state = mixedFamily();
    expect(computeDistances(state)).toEqual(getRelationDistances(state));
  });

  it("无 meId 时全部为 null", () => {
    const state = { ...mixedFamily(), meId: null };
    const distances = getRelationDistances(state);
    for (const d of distances.values()) expect(d).toBe(null);
  });
});

describe("descendantSetOf · 与 isBloodDescendant 逐人等价", () => {
  it("批量集合与逐人上溯判定完全一致", () => {
    const state = mixedFamily();
    const childIndex = buildChildIndex(state);
    const set = descendantSetOf(state, "ME", childIndex);
    expect(set.size).toBeGreaterThan(0);
    for (const id of Object.keys(state.persons)) {
      expect(set.has(id), id).toBe(isBloodDescendant(state, id, "ME"));
    }
    // 岳家血亲不是我的血亲后代（经配偶边连通 ≠ 血亲）
    expect(set.has("W")).toBe(false);
    expect(set.has("WF")).toBe(false);
    expect(set.has("S")).toBe(true);
  });
});

describe("ancestorClosure / shareAParent", () => {
  it("祖先闭包含本人、直系与更上层", () => {
    const state = mixedFamily();
    const mine = ancestorClosure(state, "ME");
    expect(mine.has("ME")).toBe(true);
    expect(mine.has("F")).toBe(true);
    expect(mine.has("GF")).toBe(true);
    expect(mine.has("GM")).toBe(true);
    // 配偶与子女不在祖先闭包里
    expect(mine.has("W")).toBe(false);
    expect(mine.has("S")).toBe(false);
  });

  it("shareAParent：同父算、同母算、都无不算", () => {
    const state = mixedFamily();
    // S 与 D 同父同母
    expect(shareAParent(state, "S", "D")).toBe(true);
    // 构造一个只有同父的半同胞
    const half = person("HALF");
    const withHalf: FamilyState = {
      ...state,
      persons: { ...state.persons, HALF: half },
      parents: { ...state.parents, HALF: { fatherId: "ME" } },
    };
    expect(shareAParent(withHalf, "S", "HALF")).toBe(true);
    expect(shareAParent(withHalf, "F", "S")).toBe(false);
    expect(shareAParent(withHalf, "W", "S")).toBe(false);
  });
});
