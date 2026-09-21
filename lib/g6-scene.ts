import { type FamilyState } from "./family";
import { buildKinshipMap } from "./kinship";
import {
  type LineageFilter,
  type LineageKind,
  classifyLineage,
  computeDistances,
} from "./lineage";
import { layoutFamilyTree } from "./tree";

/**
 * G6 场景数据 —— **复用自研布局几何，不是第二套布局**。
 *
 * G6 模式调用与自研画布同一个 `layoutFamilyTree()`，把节点坐标、连线 d 路径
 * 与世代条带翻译成 G6 的数据格式。「夫妻先横线成单元、再由总线连下一代」
 * 与辈分行对齐因此在两个引擎下完全一致，G6 只负责用 canvas 渲染一张简化卡片。
 *
 * 早期的 dagre 方案已废弃：配偶边参与排秩会把夫妻拆到不同层，
 * 并连锁推歪下方所有世代，正是「G6 看不了辈分」的根因。
 */

/** G6 画在 canvas 上，解析不了 CSS 变量，色值需写实 */
export const G6_LINEAGE_COLOR: Record<LineageKind, string> = {
  ego: "#2563eb",
  paternal: "#0284c7",
  maternal: "#c026d3",
  descendant: "#059669",
  sibling: "#64748b",
  affinal: "#d97706",
  collateral: "#64748b",
  orphan: "#94a3b8",
};

/**
 * G6 卡片足迹必须与自研布局的 NODE_W × NODE_H 完全一致：
 * routes 的端点是按布局框边缘/中点算的，卡片小于布局框时端点会落空。
 * 另外 G6 的 html 节点按**左上角**锚定（实测 5.0.x，非文档的中心锚定），
 * 所以坐标直接给布局的左上角。
 */
export const G6_NODE_WIDTH = 208;
export const G6_NODE_HEIGHT = 132;

export type PathCommand = [command: string, ...args: number[]];

/**
 * 解析本仓库连线用到的 SVG path 指令子集（M/H/V/L/Z，绝对坐标）。
 * buildRoutes 只会产出这几种指令；遇到不认识的指令跳过而不是抛错，
 * 让异常数据退化为缺线而不是整图崩溃。
 */
export function parseSvgPathD(d: string): PathCommand[] {
  const tokens = d.match(/[MHVLZ]|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) ?? [];
  const commands: PathCommand[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === "M" || cmd === "L") {
      const x = Number(tokens[i + 1]);
      const y = Number(tokens[i + 2]);
      if (Number.isFinite(x) && Number.isFinite(y)) commands.push([cmd, x, y]);
      i += 3;
    } else if (cmd === "H" || cmd === "V") {
      const v = Number(tokens[i + 1]);
      if (Number.isFinite(v)) commands.push([cmd, v]);
      i += 2;
    } else if (cmd === "Z") {
      commands.push([cmd]);
      i += 1;
    } else {
      i += 1;
    }
  }
  return commands;
}

export interface G6SceneNode {
  id: string;
  name: string;
  term: string;
  lineage: LineageKind;
  color: string;
  /** G6 html 节点按左上角锚定，直接给布局框的左上角 */
  x: number;
  y: number;
}

export interface G6SceneEdge {
  id: string;
  source: string;
  target: string;
  kind: "blood" | "spouse";
  color: string;
  /** 拆好的 path 指令，供自定义边直接渲染 */
  path: PathCommand[];
}

export interface G6SceneBand {
  id: string;
  label: string;
  /** 世代条带标签（G6 html 节点左上角坐标） */
  x: number;
  y: number;
}

export interface G6Scene {
  nodes: G6SceneNode[];
  edges: G6SceneEdge[];
  bands: G6SceneBand[];
  width: number;
  height: number;
}

export function buildG6Scene(
  state: FamilyState,
  options: { filter?: LineageFilter; maxDepth?: number } = {}
): G6Scene {
  const layout = layoutFamilyTree(state, options);
  const distances = computeDistances(state);
  const kinship = buildKinshipMap(state, state.meId);
  const meId = state.meId;

  const nodes: G6SceneNode[] = layout.nodes.map((n) => {
    const lineage = meId
      ? classifyLineage(state, n.id, meId, distances)
      : "orphan";
    return {
      id: n.id,
      name: state.persons[n.id]?.name ?? n.id,
      term: kinship.get(n.id) ?? "",
      lineage,
      color: G6_LINEAGE_COLOR[lineage] ?? G6_LINEAGE_COLOR.orphan,
      x: n.x,
      y: n.y,
    };
  });

  const edges: G6SceneEdge[] = layout.routes.map((r) => ({
    id: r.id,
    source: r.fromId,
    target: r.toId,
    kind: r.kind,
    color:
      r.kind === "spouse"
        ? G6_LINEAGE_COLOR.affinal
        : G6_LINEAGE_COLOR[r.lineage] ?? G6_LINEAGE_COLOR.orphan,
    path: parseSvgPathD(r.d),
  }));

  // 与自研画布同款：标签条带落在每代行顶上方 30px 处（22px 高）
  const bands: G6SceneBand[] = layout.bands.map((b) => ({
    id: "band-" + b.generation,
    label: b.label,
    x: 30,
    y: b.y - 30,
  }));

  return { nodes, edges, bands, width: layout.width, height: layout.height };
}
