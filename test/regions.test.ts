import { describe, expect, it } from "vitest";

import {
  PROVINCES,
  countySuggestionsOf,
  joinAddress,
  splitAddress,
} from "@/lib/regions";

describe("地址拆合 · 省 + 市/县", () => {
  it("拆出用户实际用的那个地址", () => {
    expect(splitAddress("浙江省三门县")).toEqual({
      province: "浙江省",
      county: "三门县",
    });
  });

  it("合回去与原文一致（往返稳定）", () => {
    for (const value of [
      "浙江省三门县",
      "浙江省杭州市西湖区",
      "北京市朝阳区",
      "新疆维吾尔自治区乌鲁木齐市",
    ]) {
      const { province, county } = splitAddress(value);
      expect(joinAddress(province, county)).toBe(value);
    }
  });

  it("没有省前缀时整体当作市/县，不猜", () => {
    expect(splitAddress("三门县")).toEqual({ province: "", county: "三门县" });
  });

  it("空值与 undefined 都安全", () => {
    expect(splitAddress("")).toEqual({ province: "", county: "" });
    expect(splitAddress(undefined)).toEqual({ province: "", county: "" });
    expect(joinAddress("", "")).toBe("");
  });

  it("只有省时也成立（地址可以只填到省）", () => {
    expect(splitAddress("浙江省")).toEqual({ province: "浙江省", county: "" });
    expect(joinAddress("浙江省", "")).toBe("浙江省");
  });
});

describe("省级列表", () => {
  it("34 个省级行政区，无重复", () => {
    expect(PROVINCES).toHaveLength(34);
    expect(new Set(PROVINCES).size).toBe(34);
  });

  it("包含浙江省", () => {
    expect(PROVINCES).toContain("浙江省");
  });
});

describe("市/县建议", () => {
  it("浙江省含三门县（用户点名的那个）", () => {
    expect(countySuggestionsOf("浙江省")).toContain("三门县");
  });

  it("未收录的省返回空数组，退化为自由输入而不是报错", () => {
    expect(countySuggestionsOf("河北省")).toEqual([]);
    expect(countySuggestionsOf("")).toEqual([]);
  });
});
