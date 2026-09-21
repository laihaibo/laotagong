import { type FamilyState, importState, loadState, saveState } from "./family";

/** 放在 public/ 下的开发用导出文件（.gitignore 已排除，不进版本库） */
export const DEV_SAMPLE_FILE = "laotagong-2026-09-21.json";

/**
 * 开发模式示例数据。
 *
 * - 仅 `NODE_ENV=development` 生效（Next.js 构建期内联，生产构建直接摇掉）；
 * - 默认只在本机存储为空时载入，绝不动用户的真实数据；
 * - `force = true` 覆盖现有数据（设置弹窗的「重载示例数据」按钮）；
 * - fetch 用相对路径，静态导出部署在子路径（NEXT_PUBLIC_BASE_PATH）下也能命中；
 * - 任何失败都静默返回 null：示例数据缺席不该挡住应用启动。
 */
export async function loadDevSample(force = false): Promise<FamilyState | null> {
  if (process.env.NODE_ENV !== "development") return null;
  if (!force && Object.keys(loadState().persons).length > 0) return null;
  try {
    const res = await fetch(DEV_SAMPLE_FILE);
    if (!res.ok) return null;
    const next = importState(await res.text());
    return saveState(next) ? next : null;
  } catch {
    return null;
  }
}
