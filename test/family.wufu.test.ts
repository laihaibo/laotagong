import { describe, expect, it } from "vitest";

import {
  buildWufuMap,
  createPerson,
  wufuOf,
  zodiacOf,
  type FamilyState,
  type Person,
} from "@/lib/family";

/**
 * 手搭四代家族，覆盖五服的「同父 / 同祖 / 同曾祖」三档。
 *
 *        GGA（曾祖）
 *        ├── GA（祖父）
 *        │   ├── F（父）── ME（我）── SON
 *        │   └── FB（伯叔）── COUSIN（堂兄弟，共同祖先 = GA）
 *        └── GB（祖父的兄弟）
 *            └── CB（从兄弟，共同祖先 = GGA）
 */
function buildTree(): FamilyState {
  const ids = [
    "GGA",
    "GA",
    "GB",
    "F",
    "FB",
    "COUSIN",
    "CB",
    "ME",
    "SON",
    "WIFE",
  ];
  const persons: Record<string, Person> = {};
  for (const id of ids) persons[id] = createPerson({ id, name: id, gender: "male" });

  return {
    version: 1,
    persons,
    parents: {
      GA: { fatherId: "GGA" },
      GB: { fatherId: "GGA" },
      F: { fatherId: "GA" },
      FB: { fatherId: "GA" },
      COUSIN: { fatherId: "FB" },
      CB: { fatherId: "GB" },
      ME: { fatherId: "F" },
      SON: { fatherId: "ME" },
    },
    spouses: [{ a: "ME", b: "WIFE" }],
    meId: "ME",
  };
}

describe("五服 · 直系", () => {
  const state = buildTree();

  it("父 → 斩衰", () => {
    const r = wufuOf(state, "F");
    expect(r?.grade).toBe("斩衰");
    expect(r?.basis).toContain("父母");
  });

  it("祖父 → 齐衰", () => {
    expect(wufuOf(state, "GA")?.grade).toBe("齐衰");
  });

  it("曾祖辈 → 齐衰（三月）", () => {
    const r = wufuOf(state, "GGA");
    expect(r?.grade).toBe("齐衰");
    expect(r?.months).toBe("三月");
  });

  it("子女 → 斩衰", () => {
    expect(wufuOf(state, "SON")?.grade).toBe("斩衰");
  });

  it("本人 → null（不对自己算服制）", () => {
    expect(wufuOf(state, "ME")).toBeNull();
  });
});

describe("五服 · 旁系按「到共同祖先的代数」定服", () => {
  const state = buildTree();

  it("同父（伯叔）→ 大功（祖为共同祖先，1 代上溯到父、父辈旁系）", () => {
    // FB 与 ME 的共同祖先是 GA；ME 上溯 2 代、FB 上溯 1 代 ⇒ 取较大值 2 ⇒ 大功
    const r = wufuOf(state, "FB");
    expect(r?.grade).toBe("大功");
  });

  it("堂兄弟（同祖）→ 大功", () => {
    const r = wufuOf(state, "COUSIN");
    expect(r?.grade).toBe("大功");
    expect(r?.basis).toContain("同祖");
  });

  it("从兄弟（同曾祖）→ 小功", () => {
    const r = wufuOf(state, "CB");
    expect(r?.grade).toBe("小功");
    expect(r?.basis).toContain("同曾祖");
  });

  it("推导依据会被写出来，用户可以核对凭什么", () => {
    expect(wufuOf(state, "COUSIN")?.basis).toBeTruthy();
    expect(wufuOf(state, "F")?.basis).toBeTruthy();
  });
});

describe("五服 · 姻亲与未连通", () => {
  it("配偶不在本宗五服内，单独标注", () => {
    const r = wufuOf(buildTree(), "WIFE");
    expect(r?.months).toBe("本宗之外");
    expect(r?.basis).toContain("配偶");
  });

  it("与「我」无血缘路径的人 → 出服", () => {
    const state = buildTree();
    state.persons.STRANGER = createPerson({ id: "STRANGER", name: "路人" });
    const r = wufuOf(state, "STRANGER");
    expect(r?.grade).toBe("出服");
    expect(r?.basis).toContain("无共同祖先");
  });

  it("没有「我」时返回 null", () => {
    const state = buildTree();
    state.meId = null;
    expect(wufuOf(state, "F")).toBeNull();
  });
});

describe("五服 · 批量版与逐人版一致", () => {
  it("buildWufuMap 与逐人 wufuOf 完全一致", () => {
    const state = buildTree();
    state.persons.STRANGER = createPerson({ id: "STRANGER", name: "路人" });
    const batched = buildWufuMap(state);
    for (const id of Object.keys(state.persons)) {
      expect(batched.get(id) ?? null, id).toEqual(wufuOf(state, id));
    }
  });

  it("没有「我」时批量版为空表", () => {
    const state = buildTree();
    state.meId = null;
    expect(buildWufuMap(state).size).toBe(0);
  });
});

describe("生肖 · 由生年推导", () => {
  it("1950 → 虎", () => {
    expect(zodiacOf("1950")?.label).toBe("虎");
  });

  it("1984 → 鼠（甲子年）", () => {
    expect(zodiacOf("1984")?.label).toBe("鼠");
  });

  it("2026 → 马", () => {
    expect(zodiacOf("2026")?.label).toBe("马");
  });

  it("非规范写法仍能推出，但标记为推算", () => {
    const r = zodiacOf("约1950");
    expect(r?.label).toBe("虎");
    expect(r?.approx).toBe(true);
  });

  it("规范四位年份不算推算", () => {
    expect(zodiacOf("1950")?.approx).toBe(false);
  });

  it("无年份或无法解析时返回 null", () => {
    expect(zodiacOf("")).toBeNull();
    expect(zodiacOf(undefined)).toBeNull();
    expect(zodiacOf("?")).toBeNull();
  });
});
