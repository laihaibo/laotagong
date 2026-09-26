import { describe, expect, it } from "vitest";

import {
  RELATION_APPLIERS,
  addParentLink,
  addSpouseLink,
  areSpouses,
  createPerson,
  getCoParentIds,
  getFatherId,
  getMotherId,
  type FamilyState,
  type Person,
} from "@/lib/family";

/**
 * RELATION_APPLIERS 是「新建关系」的唯一映射表（family-app 与 fuzz 测试共用）。
 * 这里守住它与数据不变量的契约：
 * - 父/母走 addParentLink，**不建婚姻边**（共同养育 ≠ 婚姻）；
 * - 配偶走 addSpouseLink 并触发回填；
 * - 子女走 linkChildWithParents（唯一候选自动补另一端）。
 */

function person(id: string, gender: Person["gender"]): Person {
  return createPerson({ id, name: id, gender, createdAt: 1 });
}

function egoState(): { state: FamilyState; ego: string } {
  const ego = person("EGO", "male");
  const state: FamilyState = {
    version: 1,
    persons: { EGO: ego },
    parents: {},
    spouses: [],
    meId: "EGO",
  };
  return { state, ego: "EGO" };
}

function withAdded(
  state: FamilyState,
  p: Person,
  apply: (s: FamilyState, personId: string) => FamilyState
): FamilyState {
  return apply(
    { ...state, persons: { ...state.persons, [p.id]: p } },
    p.id
  );
}

describe("RELATION_APPLIERS · father/mother 不建婚姻边", () => {
  it("添加父亲：亲子边建立、spouses 保持为空", () => {
    const { state } = egoState();
    const dad = person("DAD", "male");
    const next = withAdded(state, dad, (s, id) =>
      RELATION_APPLIERS.father(s, "EGO", id)
    );
    expect(getFatherId(next, "EGO")).toBe("DAD");
    expect(next.spouses).toHaveLength(0);
    // 共同养育可以从亲子边推导，但绝不能被回写进 spouses
    expect(getCoParentIds(next, "DAD")).toEqual([]);
  });

  it("先加子女、后加母亲：母亲与父亲之间不产生婚姻边", () => {
    const { state } = egoState();
    const kid = person("KID", "female");
    const mom = person("MOM", "female");
    const afterKid = withAdded(state, kid, (s, id) =>
      RELATION_APPLIERS.child(s, "EGO", id)
    );
    const afterMom = withAdded(afterKid, mom, (s, id) =>
      RELATION_APPLIERS.mother(s, "EGO", id)
    );
    expect(getMotherId(afterMom, "EGO")).toBe("MOM");
    expect(getFatherId(afterMom, "EGO")).toBeNull();
    expect(afterMom.spouses).toHaveLength(0);
  });

  it("spouse：建婚姻边，并回填已有子女缺失的另一端双亲", () => {
    const { state } = egoState();
    const kid = person("KID", "female");
    const wife = person("WIFE", "female");
    const afterKid = withAdded(state, kid, (s, id) =>
      RELATION_APPLIERS.child(s, "EGO", id)
    );
    expect(getMotherId(afterKid, "KID")).toBeNull();

    const afterWife = withAdded(afterKid, wife, (s, id) =>
      RELATION_APPLIERS.spouse(s, "EGO", id)
    );
    expect(areSpouses(afterWife, "EGO", "WIFE")).toBe(true);
    // 唯一配偶 → 无歧义回填
    expect(getMotherId(afterWife, "KID")).toBe("WIFE");
  });

  it("child：本人有唯一配偶时自动补双亲，子女与兄妹同挂", () => {
    const { state } = egoState();
    const wife = person("WIFE", "female");
    const s1 = person("S1", "male");
    const s2 = person("S2", "female");
    const afterWife = withAdded(state, wife, (s, id) =>
      RELATION_APPLIERS.spouse(s, "EGO", id)
    );
    const afterS1 = withAdded(afterWife, s1, (s, id) =>
      RELATION_APPLIERS.child(s, "EGO", id)
    );
    const afterS2 = withAdded(afterS1, s2, (s, id) =>
      RELATION_APPLIERS.child(s, "EGO", id)
    );
    expect(getFatherId(afterS2, "S1")).toBe("EGO");
    expect(getMotherId(afterS2, "S1")).toBe("WIFE");
    expect(getFatherId(afterS2, "S2")).toBe("EGO");
    expect(getMotherId(afterS2, "S2")).toBe("WIFE");
  });

  it("与 addParentLink/addSpouseLink 直调逐位一致（映射表不许有私货）", () => {
    const a = egoState();
    const b = egoState();
    const dad = person("DAD", "male");
    const viaTable = withAdded(a.state, dad, (s, id) =>
      RELATION_APPLIERS.father(s, "EGO", id)
    );
    const viaDirect = withAdded(b.state, dad, (s, id) =>
      addParentLink(s, "EGO", id, "father")
    );
    expect(viaTable).toEqual(viaDirect);

    const wifeA = egoState();
    const wifeB = egoState();
    const w = person("W", "female");
    const viaTableSpouse = withAdded(wifeA.state, w, (s, id) =>
      RELATION_APPLIERS.spouse(s, "EGO", id)
    );
    const viaDirectSpouse = withAdded(wifeB.state, w, (s, id) =>
      addSpouseLink(s, "EGO", id)
    );
    expect(viaTableSpouse).toEqual(viaDirectSpouse);
  });
});
