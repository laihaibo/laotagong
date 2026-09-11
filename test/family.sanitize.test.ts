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

describe("AC-22 · 非规范年份原样保留", () => {
  it("约1950 / ? / 1949- 全部往返不变", () => {
    const values = ["约1950", "?", "1949-", "民国38年"];
    for (const v of values) {
      const p = createPerson({ id: "y", name: "甲", birthYear: v });
      const back = importState(
        exportState({ ...createEmptyState(), persons: { y: p } })
      ).persons.y;
      expect(back.birthYear).toBe(v);
    }
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
