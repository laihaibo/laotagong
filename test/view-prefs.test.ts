import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_VIEW_PREFS,
  LEGACY_LAYOUT_MODE_KEY,
  MAX_GENERATIONS,
  MIN_GENERATIONS,
  loadViewPrefs,
  saveViewPrefs,
} from "@/lib/view-prefs";

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.removeItem(LEGACY_LAYOUT_MODE_KEY);
  vi.restoreAllMocks();
});

describe("loadViewPrefs · 白名单强转", () => {
  it("空存储回落默认值", () => {
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS);
  });

  it("损坏 JSON 不抛异常，回落默认值", () => {
    window.localStorage.setItem("laotagong:view-prefs:v1", "{not json");
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS);
  });

  it("非布尔 showMinimap 回落默认", () => {
    window.localStorage.setItem(
      "laotagong:view-prefs:v1",
      JSON.stringify({ showMinimap: "yes", maxDepth: 3 }),
    );
    expect(loadViewPrefs().showMinimap).toBe(DEFAULT_VIEW_PREFS.showMinimap);
    expect(loadViewPrefs().maxDepth).toBe(3);
  });

  it("世代范围越界收敛到 [MIN, MAX]", () => {
    window.localStorage.setItem(
      "laotagong:view-prefs:v1",
      JSON.stringify({ maxDepth: 99 }),
    );
    expect(loadViewPrefs().maxDepth).toBe(MAX_GENERATIONS);

    window.localStorage.setItem(
      "laotagong:view-prefs:v1",
      JSON.stringify({ maxDepth: 0 }),
    );
    expect(loadViewPrefs().maxDepth).toBe(MIN_GENERATIONS);
  });

  it("非数值与小数：回落默认 / 四舍五入", () => {
    window.localStorage.setItem(
      "laotagong:view-prefs:v1",
      JSON.stringify({ maxDepth: "many" }),
    );
    expect(loadViewPrefs().maxDepth).toBe(DEFAULT_VIEW_PREFS.maxDepth);

    window.localStorage.setItem(
      "laotagong:view-prefs:v1",
      JSON.stringify({ maxDepth: 4.6 }),
    );
    expect(loadViewPrefs().maxDepth).toBe(5);
  });
});

describe("saveViewPrefs · 读-改-写合并", () => {
  it("只 patch 一个字段时不覆盖另一个字段", () => {
    expect(saveViewPrefs({ maxDepth: 4 })).toBe(true);
    expect(saveViewPrefs({ showMinimap: false })).toBe(true);
    const prefs = loadViewPrefs();
    expect(prefs.maxDepth).toBe(4);
    expect(prefs.showMinimap).toBe(false);
  });

  it("存储抛异常时返回 false，不向上抛", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => saveViewPrefs({ maxDepth: 2 })).not.toThrow();
    expect(saveViewPrefs({ maxDepth: 2 })).toBe(false);
  });

  it("读-改-写在已有坏数据上仍能写入合法结果", () => {
    window.localStorage.setItem("laotagong:view-prefs:v1", "garbage");
    expect(saveViewPrefs({ maxDepth: 2 })).toBe(true);
    expect(loadViewPrefs().maxDepth).toBe(2);
  });
});
