/**
 * 画布显示偏好的 localStorage 持久化（小地图开关、世代范围）。
 *
 * 独立于家族数据键（invariant：STORAGE_KEY 变更必须配迁移——这里是新键，
 * 不触碰 `laotagong:family:v1`）。读取一律白名单强转 + try/catch，
 * 坏值回落默认；写入走读-改-写合并，画布（世代范围）与设置弹窗（小地图）
 * 各写各的字段，互不覆盖。
 */

const VIEW_PREFS_KEY = "laotagong:view-prefs:v1";

export interface ViewPrefs {
  showMinimap: boolean;
  maxDepth: number;
}

/** 世代范围上下限：±1 代到 ±10 代 */
export const MIN_GENERATIONS = 1;
export const MAX_GENERATIONS = 10;

export const DEFAULT_VIEW_PREFS: ViewPrefs = { showMinimap: true, maxDepth: 6 };

function clampGenerations(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_VIEW_PREFS.maxDepth;
  return Math.min(MAX_GENERATIONS, Math.max(MIN_GENERATIONS, n));
}

export function loadViewPrefs(): ViewPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_VIEW_PREFS };
  try {
    const raw = window.localStorage.getItem(VIEW_PREFS_KEY);
    if (!raw) return { ...DEFAULT_VIEW_PREFS };
    const data = JSON.parse(raw) as Partial<ViewPrefs> | null;
    return {
      showMinimap:
        typeof data?.showMinimap === "boolean"
          ? data.showMinimap
          : DEFAULT_VIEW_PREFS.showMinimap,
      maxDepth: clampGenerations(data?.maxDepth),
    };
  } catch {
    return { ...DEFAULT_VIEW_PREFS };
  }
}

export function saveViewPrefs(patch: Partial<ViewPrefs>): boolean {
  if (typeof window === "undefined") return false;
  try {
    const next = { ...loadViewPrefs(), ...patch };
    window.localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** 已废弃的布局引擎持久化键（G6 已移除），水合时顺手清理 */
export const LEGACY_LAYOUT_MODE_KEY = "laotagong:layout-mode";
