import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  THEME_STORAGE_KEY,
  applyTheme,
  loadThemeMode,
  resolveTheme,
  saveThemeMode,
  type ThemeMode,
} from "@/lib/theme";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("light", "dark");
  vi.restoreAllMocks();
});

describe("resolveTheme", () => {
  it("light/dark 原样返回，不查 matchMedia", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("system 跟随 prefers-color-scheme", () => {
    // jsdom 未实现 matchMedia，桩掉后两条分支都要能走到
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true } as MediaQueryList),
    );
    expect(resolveTheme("system")).toBe("dark");
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false } as MediaQueryList),
    );
    expect(resolveTheme("system")).toBe("light");
    vi.unstubAllGlobals();
  });
});

describe("loadThemeMode / saveThemeMode · 存取循环", () => {
  it.each(["light", "dark", "system"] as ThemeMode[])("存取 %s", (mode) => {
    saveThemeMode(mode);
    expect(loadThemeMode()).toBe(mode);
  });

  it("空存储回落 light", () => {
    expect(loadThemeMode()).toBe("light");
  });

  it("非法值回落 light", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(loadThemeMode()).toBe("light");
  });

  it("损坏 JSON 不影响读取（值为纯字符串键，读失败走 catch）", () => {
    // localStorage 值本身总是字符串，这里验证读取路径整体健壮
    window.localStorage.setItem(THEME_STORAGE_KEY, "");
    expect(loadThemeMode()).toBe("light");
  });

  it("存储抛异常时 saveThemeMode 不向上抛", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => saveThemeMode("dark")).not.toThrow();
  });
});

describe("applyTheme", () => {
  it("在 documentElement 上挂对应的类并设置 colorScheme", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
