import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyState,
  createPerson,
  newId,
  normalizeEvent,
  saveState,
} from "@/lib/family";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("newId · 非安全上下文也要能用", () => {
  it("有 crypto.randomUUID 时用它", () => {
    const spy = vi.spyOn(crypto, "randomUUID");
    const id = newId();
    expect(id).toBeTruthy();
    // jsdom 的 crypto 可能没有 randomUUID，没有就退回下面的分支
    if (typeof crypto.randomUUID === "function") expect(spy).toHaveBeenCalled();
  });

  it("crypto.randomUUID 不存在时不抛异常，仍产出 id", () => {
    const original = crypto.randomUUID;
    // 模拟 http + 局域网 IP 的场景：randomUUID 不存在
    // 故意删除以复现非安全上下文（TS 允许删可选属性，不需要抑制指令）
    delete (crypto as { randomUUID?: unknown }).randomUUID;
    try {
      expect(() => newId()).not.toThrow();
      expect(newId()).toBeTruthy();
      expect(createPerson({ name: "甲" }).id).toBeTruthy();
      expect(normalizeEvent({ type: "custom", date: "" })?.id).toBeTruthy();
    } finally {
      Object.defineProperty(crypto, "randomUUID", {
        value: original,
        configurable: true,
      });
    }
  });

  it("连续生成的 id 不重复", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
  });
});

describe("saveState · 写不进去也不能把页面带崩", () => {
  it("正常写入时返回 true", () => {
    expect(saveState(createEmptyState())).toBe(true);
  });

  it("localStorage 抛异常时返回 false，不向上抛", () => {
    // 配额超限 / Safari 无痕 / 浏览器禁用存储，都是抛异常
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => saveState(createEmptyState())).not.toThrow();
    expect(saveState(createEmptyState())).toBe(false);
  });
});
