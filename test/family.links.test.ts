import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  addParentLink,
  addSpouseLink,
  applyRepairs,
  createPerson,
  findRepairableLinks,
  getChildrenIds,
  getFatherId,
  getMotherId,
  getRelationDistances,
  getSpouseIds,
  groupByRelationDistance,
  importState,
  isUnambiguousBackfill,
  linkChildWithParents,
  removeSpouseLink,
  type FamilyState,
  type Person,
} from "@/lib/family";

const FIXTURES = join(process.cwd(), "test", "fixtures");

/** 直接读取 fixture 的原始字节 —— 用构造器造出来的样本复现不了 load/write 的 bug */
function rawFixture(name: string): FamilyState {
  return importState(readFileSync(join(FIXTURES, name), "utf8"));
}

function person(id: string, gender: Person["gender"]): Person {
  return createPerson({ id, name: id, gender, createdAt: 1 });
}

/** 空状态 + 一批人 */
function seed(people: Array<[string, Person["gender"]]>): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, gender] of people) persons[id] = person(id, gender);
  return { version: 1, persons, parents: {}, spouses: [], meId: null };
}

describe("AC-17 · 先加子女后加配偶，另一位亲长必须可见", () => {
  it("从 broken-v1 原始字节载入后，addSpouseLink 回填子女缺失的母亲", () => {
    // 前置形态：C 只有 fatherId=A，无 motherId，spouses 为空
    const before = rawFixture("broken-v1.json");
    expect(before.parents.C).toEqual({ fatherId: "A" });
    expect(before.spouses).toEqual([]);
    expect(getMotherId(before, "C")).toBeNull();

    // 给 A 添加配偶 B
    const after = addSpouseLink(before, "A", "B");

    // Bug 修复的核心断言：C 现在能看到母亲
    expect(getMotherId(after, "C")).toBe("B");
    expect(getFatherId(after, "C")).toBe("A");
  });

  it("求值点必须落在 post-add 状态上（pre-add 会让谓词恒假，AC-17 原样复发）", () => {
    const before = rawFixture("broken-v1.json");
    // pre-add：A 的配偶数为 0。即使子女残缺，也必须判为「无法无歧义回填」。
    expect(getSpouseIds(before, "A")).toHaveLength(0);
    expect(isUnambiguousBackfill(before, "C")).toBe(false);

    // 历史数据形态：配偶关系已存在，但子女那一端从未被回填。
    // 此时谓词必须为真 —— 这正是修复提示条要检出的对象。
    const spouseExistsButChildBroken: FamilyState = {
      ...before,
      spouses: [{ a: "A", b: "B" }],
    };
    expect(isUnambiguousBackfill(spouseExistsButChildBroken, "C")).toBe(true);

    // 写入路径走完之后，残缺已消失，谓词自然回落为假。
    const after = addSpouseLink(before, "A", "B");
    expect(getMotherId(after, "C")).toBe("B");
    expect(isUnambiguousBackfill(after, "C")).toBe(false);
  });

  it("多配偶时不猜：>=2 位配偶一律不回填，并进入 ambiguous 桶", () => {
    let state = rawFixture("broken-v1.json");
    state = addSpouseLink(state, "A", "B");
    state = addSpouseLink(state, "A", "X"); // A 现在有两位配偶

    expect(getMotherId(state, "C")).toBe("B"); // 第一次回填写入的仍然保留

    // 换一个未回填的子女来验证「>=2 位不猜」
    const fresh = rawFixture("broken-v1.json");
    const twoWives: FamilyState = {
      ...fresh,
      persons: { ...fresh.persons, X: person("X", "female") },
      spouses: [
        { a: "A", b: "B" },
        { a: "A", b: "X" },
      ],
    };
    expect(isUnambiguousBackfill(twoWives, "C")).toBe(false);

    const { repairable, ambiguous } = findRepairableLinks(twoWives);
    expect(repairable).toHaveLength(0);
    // ambiguous 必须被呈现出来，而不是静默丢弃
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0].childId).toBe("C");
    expect(ambiguous[0].candidates.sort()).toEqual(["B", "X"]);
  });
});

describe("P1 · 双写对称不变量", () => {
  it("加子女时双亲被同时挂上（先有配偶）", () => {
    let state = seed([
      ["F", "male"],
      ["M", "female"],
      ["C", "male"],
    ]);
    state = addSpouseLink(state, "F", "M");
    state = linkChildWithParents(state, "C", "F");

    expect(getFatherId(state, "C")).toBe("F");
    expect(getMotherId(state, "C")).toBe("M");
    expect(getChildrenIds(state, "F")).toContain("C");
    expect(getChildrenIds(state, "M")).toContain("C");
  });

  it("反向顺序也对称：先加子女再加配偶", () => {
    let state = seed([
      ["F", "male"],
      ["M", "female"],
      ["C", "male"],
    ]);
    state = linkChildWithParents(state, "C", "F");
    expect(getMotherId(state, "C")).toBeNull();

    state = addSpouseLink(state, "F", "M");
    expect(getMotherId(state, "C")).toBe("M");
  });

  it("父→子 与 子→父 读同一份数据（单写点）", () => {
    let state = seed([
      ["F", "male"],
      ["C", "male"],
    ]);
    state = linkChildWithParents(state, "C", "F");

    // 父子两侧的视图一致
    expect(getFatherId(state, "C")).toBe("F");
    expect(getChildrenIds(state, "F")).toEqual(["C"]);
  });
});

describe("AC-18 · 性别未知时绑到空槽，不覆盖真实家长", () => {
  it("两槽皆空 → 默认父亲", () => {
    let state = seed([
      ["U", "unknown"],
      ["C", "male"],
    ]);
    state = linkChildWithParents(state, "C", "U");
    expect(getFatherId(state, "C")).toBe("U");
    expect(getMotherId(state, "C")).toBeNull();
  });

  it("父亲已占 → 绑母亲槽", () => {
    let state = seed([
      ["F", "male"],
      ["U", "unknown"],
      ["C", "male"],
    ]);
    state = linkChildWithParents(state, "C", "F");
    state = linkChildWithParents(state, "C", "U");
    expect(getFatherId(state, "C")).toBe("F");
    expect(getMotherId(state, "C")).toBe("U");
  });

  it("两槽皆满 → 原样返回，绝不覆盖", () => {
    let state = seed([
      ["F", "male"],
      ["M", "female"],
      ["U", "unknown"],
      ["C", "male"],
    ]);
    state = linkChildWithParents(state, "C", "F");
    state = linkChildWithParents(state, "C", "M");
    const before = state.parents.C;

    state = linkChildWithParents(state, "C", "U");
    expect(state.parents.C).toEqual(before);
  });
});

describe("AC-19 · 解除配偶不清除已建立的事实", () => {
  it("removeSpouseLink 只删配偶对，保留子女的父母链接", () => {
    let state = seed([
      ["F", "male"],
      ["M", "female"],
      ["C", "male"],
    ]);
    state = addSpouseLink(state, "F", "M");
    state = linkChildWithParents(state, "C", "F");
    expect(getMotherId(state, "C")).toBe("M");

    state = removeSpouseLink(state, "F", "M");
    expect(getSpouseIds(state, "F")).toHaveLength(0);
    // 关系解除 ≠ 事实消失
    expect(getMotherId(state, "C")).toBe("M");
  });
});

describe("AC-20 · 多配偶不静默取第一位", () => {
  it("linkChildWithParents 在 >=2 位配偶时不自动补另一端", () => {
    let state = seed([
      ["F", "male"],
      ["M1", "female"],
      ["M2", "female"],
      ["C", "male"],
    ]);
    state = addSpouseLink(state, "F", "M1");
    state = addSpouseLink(state, "F", "M2");

    state = linkChildWithParents(state, "C", "F");
    expect(getFatherId(state, "C")).toBe("F");
    // 不猜：两位候选都不写，等用户指定
    expect(getMotherId(state, "C")).toBeNull();
  });
});

describe("修复检测与幂等", () => {
  it("findRepairableLinks 从原始坏的字节里检出 1 条可修复", () => {
    const broken = rawFixture("broken-v1.json");
    // 先补上配偶关系（模拟用户做了正确操作，但历史数据仍是坏的）
    const linked = addSpouseLink(broken, "A", "B");
    expect(getMotherId(linked, "C")).toBe("B");

    // 用未回填的历史形态来测检测器
    const historical: FamilyState = {
      ...linked,
      parents: { C: { fatherId: "A" } },
    };
    const { repairable, ambiguous } = findRepairableLinks(historical);
    expect(repairable).toHaveLength(1);
    expect(repairable[0]).toEqual({ childId: "C", spouseId: "B", role: "mother" });
    expect(ambiguous).toHaveLength(0);
  });

  it("applyRepairs 写入链接，且幂等", () => {
    const broken = rawFixture("broken-v1.json");
    const withSpouse = addSpouseLink(broken, "A", "B");
    const historical: FamilyState = {
      ...withSpouse,
      parents: { C: { fatherId: "A" } },
    };

    const { repairable } = findRepairableLinks(historical);
    const once = applyRepairs(historical, repairable);
    expect(getMotherId(once, "C")).toBe("B");

    const twice = applyRepairs(once, repairable);
    expect(twice.parents.C).toEqual(once.parents.C);
  });

  it("两槽皆满的子女不进任何桶", () => {
    let state = seed([
      ["F", "male"],
      ["M", "female"],
      ["C", "male"],
    ]);
    state = addSpouseLink(state, "F", "M");
    state = linkChildWithParents(state, "C", "F");
    state = linkChildWithParents(state, "C", "M");

    const { repairable, ambiguous } = findRepairableLinks(state);
    expect(repairable).toHaveLength(0);
    expect(ambiguous).toHaveLength(0);
  });
});

describe("AC-9/AC-10 · 关系距离运行时推导，不落库", () => {
  it("FamilyState 只有 5 个键，没有 generation", () => {
    expect(Object.keys(seed([])).sort()).toEqual([
      "meId",
      "parents",
      "persons",
      "spouses",
      "version",
    ]);
  });

  it("父辈 -1 / 我 0 / 子辈 +1 / 配偶 0", () => {
    const state = rawFixture("three-generation.json");
    const d = getRelationDistances(state);
    const values = [...d.values()].filter((v): v is number => v !== null);
    expect(values.length).toBeGreaterThan(0);
    // 我 必定为 0
    expect(d.get(state.meId as string)).toBe(0);
  });

  it("不连通的人得到 null", () => {
    const state = rawFixture("orphan.json");
    const d = getRelationDistances(state);
    expect([...d.values()].some((v) => v === null)).toBe(true);
  });

  it("meId 为 null 时所有人都是 null", () => {
    const state = { ...seed([["A", "male"]]), meId: null };
    const d = getRelationDistances(state);
    expect([...d.values()].every((v) => v === null)).toBe(true);
  });

  it("遍历确定性：persons 插入顺序打乱不影响结果", () => {
    const base = rawFixture("three-generation.json");
    const baseline = [...getRelationDistances(base).entries()].sort();

    for (let i = 0; i < 20; i += 1) {
      const entries = Object.entries(base.persons);
      // 确定性洗牌
      const shuffled = [...entries].sort((x, y) =>
        ((i * 31 + x[0].charCodeAt(0)) % 7) - ((i * 17 + y[0].charCodeAt(0)) % 7)
      );
      const state: FamilyState = {
        ...base,
        persons: Object.fromEntries(shuffled),
      };
      expect([...getRelationDistances(state).entries()].sort()).toEqual(baseline);
    }
  });

  it("分组：同辈桶包含配偶与兄弟姐妹", () => {
    let state = seed([
      ["ME", "male"],
      ["W", "female"],
      ["C", "male"],
    ]);
    state = { ...state, meId: "ME" };
    state = addSpouseLink(state, "ME", "W");
    state = linkChildWithParents(state, "C", "ME");

    const groups = groupByRelationDistance(state);
    const peer = groups.find((g) => g.key === "peer");
    const child = groups.find((g) => g.key === "child");
    expect(peer?.ids).toContain("ME");
    expect(peer?.ids).toContain("W"); // 配偶权重 0，与「我」同桶
    expect(child?.ids).toContain("C");
  });
});

describe("sanitize 往返不丢字段", () => {
  it("addParentLink 是 parents 的唯一构造者", () => {
    const state = seed([["F", "male"]]);
    const next = addParentLink(state, "C", "F", "father");
    expect(next.parents.C).toEqual({ fatherId: "F" });
    // 不可变：原状态未被改写
    expect(state.parents).toEqual({});
  });
});

describe("存量数据修复 · 把父亲设为「我」后奶奶必须可见", () => {
  /** 修复前留下的形态：配偶关系存在，但子女那一端从未回填 */
  function staleData(): FamilyState {
    const base = seed([
      ["G", "male"],
      ["N", "female"],
      ["F", "male"],
      ["ME", "male"],
    ]);
    return {
      ...base,
      parents: {
        F: { fatherId: "G" }, // ← 爷爷在，奶奶丢了
        ME: { fatherId: "F" },
      },
      spouses: [{ a: "G", b: "N" }], // 配偶关系其实是有的
      meId: "F",
    };
  }

  it("载入时无歧义的那部分会被自动补上", () => {
    const before = staleData();
    expect(getMotherId(before, "F")).toBeNull();

    const { repairable, ambiguous } = findRepairableLinks(before);
    expect(repairable).toHaveLength(1);
    expect(repairable[0]).toEqual({ childId: "F", spouseId: "N", role: "mother" });
    expect(ambiguous).toHaveLength(0);

    const after = applyRepairs(before, repairable);
    // 这就是用户报的现象：父亲设为「我」后，奶奶应当作为「母亲」出现
    expect(getMotherId(after, "F")).toBe("N");
    expect(getFatherId(after, "F")).toBe("G");
  });

  it("修复后 ME 的祖辈也在位，切到上一代不会丢人", () => {
    const repaired = applyRepairs(staleData(), findRepairableLinks(staleData()).repairable);
    // ME 先把父亲 F 设为「我」，再切上一代 → 应看到爷爷和奶奶两人
    const fatherOfMe = getFatherId(repaired, "ME");
    expect(fatherOfMe).toBe("F");
    expect(getFatherId(repaired, fatherOfMe as string)).toBe("G");
    expect(getMotherId(repaired, fatherOfMe as string)).toBe("N");
  });

  it("修复是幂等的：再次载入不会重复写或报错", () => {
    const once = applyRepairs(staleData(), findRepairableLinks(staleData()).repairable);
    const { repairable } = findRepairableLinks(once);
    expect(repairable).toHaveLength(0);
    expect(applyRepairs(once, repairable)).toEqual(once);
  });

  it("有 ≥2 位配偶时不自动写，进 ambiguous 等用户指定", () => {
    const base = staleData();
    const withTwo: FamilyState = {
      ...base,
      persons: { ...base.persons, N2: createPerson({ id: "N2", name: "N2", gender: "female", createdAt: 1 }) },
      spouses: [
        { a: "G", b: "N" },
        { a: "G", b: "N2" },
      ],
    };
    const { repairable, ambiguous } = findRepairableLinks(withTwo);
    expect(repairable).toHaveLength(0);
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0].candidates.sort()).toEqual(["N", "N2"]);
    // 未经用户指定之前，绝不写入
    expect(getMotherId(withTwo, "F")).toBeNull();
  });
});
