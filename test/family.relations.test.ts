import { describe, expect, it } from "vitest";
import {
  defaultGenderFor,
  relationBaseOf,
  relationDisabledReason,
  relationOptions,
  spouseGenderConflictReason,
} from "@/lib/family";

describe("关系选项规则", () => {
  it("固定提供六种细分关系", () => {
    const opts = relationOptions("unknown");
    expect(opts.map((o) => o.kind)).toEqual([
      "father",
      "mother",
      "husband",
      "wife",
      "son",
      "daughter",
    ]);
    expect(opts.every((o) => o.disabledReason === null)).toBe(true);
  });

  it("男性：不能添加丈夫，可以添加妻子", () => {
    const byKind = new Map(relationOptions("male").map((o) => [o.kind, o]));
    expect(byKind.get("husband")?.disabledReason).toBe("男性不能添加丈夫");
    expect(byKind.get("wife")?.disabledReason).toBeNull();
  });

  it("女性：不能添加妻子，可以添加丈夫", () => {
    const byKind = new Map(relationOptions("female").map((o) => [o.kind, o]));
    expect(byKind.get("wife")?.disabledReason).toBe("女性不能添加妻子");
    expect(byKind.get("husband")?.disabledReason).toBeNull();
  });

  it("默认性别：父/夫/子 → 男，母/妻/女 → 女", () => {
    expect(defaultGenderFor("father")).toBe("male");
    expect(defaultGenderFor("husband")).toBe("male");
    expect(defaultGenderFor("son")).toBe("male");
    expect(defaultGenderFor("mother")).toBe("female");
    expect(defaultGenderFor("wife")).toBe("female");
    expect(defaultGenderFor("daughter")).toBe("female");
    const byKind = new Map(relationOptions("unknown").map((o) => [o.kind, o]));
    expect(byKind.get("son")?.defaultGender).toBe("male");
    expect(byKind.get("daughter")?.defaultGender).toBe("female");
  });

  it("已有父亲/母亲/配偶时对应选项禁用", () => {
    expect(relationDisabledReason("father", "male", { hasFather: true })).toBe("已有父亲");
    expect(relationDisabledReason("mother", "unknown", { hasMother: true })).toBe("已有母亲");
    expect(relationDisabledReason("wife", "female", { hasPartner: true })).toBe(
      "已有配偶或共同养育者"
    );
    expect(relationDisabledReason("husband", "female", { hasPartner: true })).toBe(
      "已有配偶或共同养育者"
    );
    // 子女不受已有关系影响
    expect(relationDisabledReason("son", "male", { hasFather: true, hasPartner: true })).toBeNull();
  });

  it("细分关系归约到底层边操作", () => {
    expect(relationBaseOf("husband")).toBe("spouse");
    expect(relationBaseOf("wife")).toBe("spouse");
    expect(relationBaseOf("son")).toBe("child");
    expect(relationBaseOf("daughter")).toBe("child");
    expect(relationBaseOf("father")).toBe("father");
    expect(relationBaseOf("mother")).toBe("mother");
  });

  it("同性不可结为配偶（数据层兜底），性别未知不设限", () => {
    expect(spouseGenderConflictReason("male", "male")).toBe("两位男性不能结为配偶");
    expect(spouseGenderConflictReason("female", "female")).toBe("两位女性不能结为配偶");
    expect(spouseGenderConflictReason("male", "female")).toBeNull();
    expect(spouseGenderConflictReason("unknown", "male")).toBeNull();
    expect(spouseGenderConflictReason("female", "unknown")).toBeNull();
  });
});
