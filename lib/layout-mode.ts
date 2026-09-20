export type LayoutMode = "custom" | "g6";

export const LAYOUT_MODE_KEY = "laotagong:layout-mode";

export const LAYOUT_MODE_META: Record<LayoutMode, { label: string; hint: string }> = {
  custom: {
    label: "自研",
    hint: "玻璃 DOM 卡片，以「我」为中心聚类",
  },
  g6: {
    label: "G6",
    hint: "AntV G6 图布局，简化节点便于对比",
  },
};

export function loadLayoutMode(): LayoutMode {
  if (typeof window === "undefined") return "custom";
  try {
    const raw = window.localStorage.getItem(LAYOUT_MODE_KEY);
    if (raw === "custom" || raw === "g6") return raw;
  } catch {
    /* ignore */
  }
  return "custom";
}

export function saveLayoutMode(mode: LayoutMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAYOUT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
