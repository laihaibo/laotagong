import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyState, exportState, type FamilyState } from "@/lib/family";
import { DEV_SAMPLE_FILE, loadDevSample } from "@/lib/dev-sample";

const SAMPLE: FamilyState = {
  version: 1,
  persons: {
    me: { id: "me", name: "示例", gender: "male", birthYear: "", birthMonth: "", birthDay: "", deathYear: "", deathMonth: "", deathDay: "", ancestralHome: "", household: "", note: "", photoUrl: "", events: [], createdAt: 1, updatedAt: 1 },
  },
  parents: {},
  spouses: [],
  meId: "me",
};

function sampleJson(): string {
  return exportState(SAMPLE);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("loadDevSample", () => {
  it("开发模式 + 本机存储为空：载入示例并写入存储", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchMock = vi.fn(async () =>
      new Response(sampleJson(), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const next = await loadDevSample();

    expect(fetchMock).toHaveBeenCalledWith(DEV_SAMPLE_FILE);
    expect(next?.persons["me"]?.name).toBe("示例");
    expect(window.localStorage.getItem("laotagong:family:v1")).toContain("示例");
  });

  it("本机已有数据：不动用户数据，也不发请求", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("laotagong:family:v1", exportState(SAMPLE));

    const next = await loadDevSample();

    expect(next).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("非开发模式：直接返回 null", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await loadDevSample()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("force=true 覆盖现有数据（设置弹窗的重载按钮）", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sampleJson(), { status: 200 }))
    );
    window.localStorage.setItem("laotagong:family:v1", exportState(createEmptyState()));

    const next = await loadDevSample(true);

    expect(next?.meId).toBe("me");
    expect(window.localStorage.getItem("laotagong:family:v1")).toContain("示例");
  });

  it("请求失败：静默返回 null，不抛异常", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

    expect(await loadDevSample()).toBeNull();
  });
});
