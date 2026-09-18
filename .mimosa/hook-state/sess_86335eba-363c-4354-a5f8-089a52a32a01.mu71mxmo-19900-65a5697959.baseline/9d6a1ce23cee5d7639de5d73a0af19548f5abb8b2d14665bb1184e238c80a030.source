import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createEmptyState,
  createPerson,
  exportState,
  importState,
  normalizePerson,
  sanitizeState,
  type FamilyState,
} from "@/lib/family";

const FIXTURES = join(process.cwd(), "test", "fixtures");

function rawFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("P-1 · 往返键一致性（写进去的东西必须读得回来）", () => {
  it("photoUrl 与 events 经过 save→load 后原样存活", () => {
    const person = createPerson({
      id: "P1",
      name: "老太公",
      photoUrl: "https://example.com/a.jpg",
      events: [
        {
          id: "e1",
          type: "migration",
          date: "约1950",
          place: "浙江",
          note: "迁居",
        },
      ],
    });
    const state: FamilyState = {
      ...createEmptyState(),
      persons: { P1: person },
    };

    // 走真实的序列化路径，而不是直接比较对象引用
    const roundTripped = importState(exportState(state));
    const back = roundTripped.persons.P1;

    expect(back.photoUrl).toBe("https://example.com/a.jpg");
    expect(back.events).toHaveLength(1);
    expect(back.events?.[0]).toMatchObject({
      id: "e1",
      type: "migration",
      date: "约1950",
      place: "浙江",
    });
  });

  it("Person 的字段清单只有一处（normalizePerson），sanitize 与 create 不各自维护", () => {
    const created = createPerson({ id: "x", name: "甲" });
    const sanitized = normalizePerson("x", created);
    // 同一份清单 ⇒ 键集合必须一致
    expect(Object.keys(created).sort()).toEqual(Object.keys(sanitized).sort());
  });

  it("旧数据（无 photoUrl / 无 events）载入后补默认值，不报错", () => {
    const legacy = createPerson({ id: "L", name: "旧人" });
    // 模拟 v1 落盘形态：删掉新字段
    const raw = { ...legacy } as Record<string, unknown>;
    delete raw.photoUrl;
    delete raw.events;

    const state = sanitizeState({
      version: 1,
      persons: { L: raw },
      parents: {},
      spouses: [],
      meId: "L",
    });

    expect(state.persons.L.photoUrl).toBe("");
    expect(state.persons.L.events).toEqual([]);
    expect(state.persons.L.name).toBe("旧人");
  });

  it("未知的额外键被丢弃，且不污染已知字段", () => {
    const state = sanitizeState({
      version: 1,
      persons: {
        X: { id: "X", name: "甲", gender: "male", junk: "should vanish" },
      },
      parents: {},
      spouses: [],
      meId: null,
    });

    expect(state.persons.X).not.toHaveProperty("junk");
    expect(state.persons.X.name).toBe("甲");
  });
});

describe("AC-22 · 年份收敛为严格 4 位（UI 已改为下拉）", () => {
  it("抽得出年份就保留年份，只丢掉修饰词", () => {
    // 「约1950」→「1950」而不是整条丢掉：比丢弃更接近无损
    expect(createPerson({ id: "y", birthYear: "约1950" }).birthYear).toBe("1950");
    expect(createPerson({ id: "y", birthYear: "1949-" }).birthYear).toBe("1949");
    expect(createPerson({ id: "y", birthYear: "民国38年" }).birthYear).toBe("");
  });

  it("抽不出年份的一律记为不详", () => {
    for (const v of ["?", "不详", "待考", ""]) {
      expect(createPerson({ id: "y", birthYear: v }).birthYear).toBe("");
    }
  });

  it("收敛结果经过往返仍然稳定（幂等）", () => {
    const first = createPerson({ id: "y", name: "甲", birthYear: "约1950" });
    const back = importState(
      exportState({ ...createEmptyState(), persons: { y: first } })
    ).persons.y;
    expect(back.birthYear).toBe("1950");
    expect(createPerson(back).birthYear).toBe("1950");
  });
});

describe("生卒月日 · 收敛到合法区间", () => {
  it("月收敛到 1..12，日收敛到 1..31", () => {
    const p = createPerson({
      id: "d",
      birthMonth: "7",
      birthDay: "15",
      deathMonth: "12",
      deathDay: "31",
    });
    expect(p.birthMonth).toBe("7");
    expect(p.birthDay).toBe("15");
    expect(p.deathMonth).toBe("12");
    expect(p.deathDay).toBe("31");
  });

  it("越界或非数字一律记为不详", () => {
    const p = createPerson({
      id: "d",
      birthMonth: "13",
      birthDay: "32",
      deathMonth: "0",
      deathDay: "abc",
    });
    expect(p.birthMonth).toBe("");
    expect(p.birthDay).toBe("");
    expect(p.deathMonth).toBe("");
    expect(p.deathDay).toBe("");
  });

  it("月日可以留空（很多长辈只知年份）", () => {
    const p = createPerson({ id: "d", birthYear: "1940" });
    expect(p.birthYear).toBe("1940");
    expect(p.birthMonth).toBe("");
    expect(p.birthDay).toBe("");
  });
});

describe("AC-23 · v1 数据载入不丢字段", () => {
  it("三个原始 fixture 都能无损载入", () => {
    for (const name of [
      "broken-v1.json",
      "two-spouse.json",
      "three-generation.json",
      "orphan.json",
    ]) {
      const state = sanitizeState(rawFixture(name));
      expect(state.version).toBe(1);
      expect(Object.keys(state.persons).length).toBeGreaterThan(0);
      // 5 键形态未被破坏
      expect(Object.keys(state).sort()).toEqual([
        "meId",
        "parents",
        "persons",
        "spouses",
        "version",
      ]);
    }
  });
});

describe("AC-10 · 世代不落库", () => {
  it("FamilyState 恰好 5 个键，且没有 generation", () => {
    const keys = Object.keys(createEmptyState()).sort();
    expect(keys).toEqual(["meId", "parents", "persons", "spouses", "version"]);
    expect(keys).not.toContain("generation");
  });

  it("Person 上没有 generation 字段", () => {
    expect(createPerson({})).not.toHaveProperty("generation");
  });
});

describe("AC-23 · 恶意/畸形输入不抛错", () => {
  it.each([null, [], "字符串", 42, { persons: null }, { persons: { x: 7 } }])(
    "sanitizeState(%j) 返回合法空状态而不抛错",
    (input) => {
      const state = sanitizeState(input);
      expect(state.version).toBe(1);
      expect(state.parents).toEqual({});
    }
  );

  it("引用完整性的四种清理都被执行", () => {
    const state = sanitizeState({
      version: 1,
      persons: {
        A: { id: "A", name: "甲", gender: "male" },
        B: { id: "B", name: "乙", gender: "female" },
      },
      parents: {
        // 子女不存在 → 整条丢弃
        GHOST: { fatherId: "A" },
        // 父不存在 → 该字段丢弃
        A: { fatherId: "NOPE", motherId: "B" },
      },
      spouses: [
        { a: "A", b: "B" },
        { a: "A", b: "B" }, // 重复 → 去重
        { a: "A", b: "GHOST" }, // 成员不存在 → 丢弃
        { a: "A", b: "A" }, // 自环 → 丢弃
      ],
      meId: "GHOST",
    });

    expect(state.parents.GHOST).toBeUndefined();
    expect(state.parents.A).toEqual({ motherId: "B" });
    expect(state.spouses).toEqual([{ a: "A", b: "B" }]);
    expect(state.meId).toBeNull();
  });
});
