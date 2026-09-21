"use client";

import { useEffect, useRef } from "react";
import type { FamilyState } from "@/lib/family";
import { type LineageFilter } from "@/lib/lineage";
import {
  G6_NODE_HEIGHT,
  G6_NODE_WIDTH,
  type G6Scene,
  buildG6Scene,
} from "@/lib/g6-scene";

const G6_CDN = "https://cdn.jsdelivr.net/npm/@antv/g6@5.0.49/dist/g6.min.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function personHtml(name: string, term: string, color: string): string {
  // 尺寸必须等于 lib/tree.ts 的 NODE_W × NODE_H：routes 的端点按这个足迹算
  const head = '<div style="width:' + G6_NODE_WIDTH + 'px;height:' + G6_NODE_HEIGHT + 'px;border-radius:14px;background:linear-gradient(145deg,rgba(255,255,255,0.88),rgba(255,255,255,0.64));border:1px solid rgba(255,255,255,0.85);box-shadow:0 8px 24px rgba(15,23,42,0.12);border-left:3px solid ';
  return head + color + ';box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 12px;font-family:-apple-system,PingFang SC,sans-serif;"><div style="max-width:100%;font-size:14px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</div><div style="max-width:100%;font-size:12px;color:' + color + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + term + '</div></div>';
}

function bandHtml(label: string): string {
  return '<div style="pointer-events:none;width:80px;height:22px;box-sizing:border-box;"><span style="display:inline-block;border-top-left-radius:6px;border-bottom-right-radius:6px;background:rgba(241,245,249,0.85);padding:2px 8px;font-size:10px;letter-spacing:0.05em;color:#64748b;font-family:-apple-system,PingFang SC,sans-serif;">' + label + '</span></div>';
}

function loadG6(): Promise<any> {
  const w = window as any;
  if (w.G6 && w.G6.Graph) return Promise.resolve(w.G6);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-g6]');
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).G6));
      existing.addEventListener('error', () => reject(new Error('g6 script error')));
      return;
    }
    const script = document.createElement('script');
    script.src = G6_CDN;
    script.async = true;
    script.dataset.g6 = '1';
    script.onload = () => resolve((window as any).G6);
    script.onerror = () => reject(new Error('g6 script load failed'));
    document.head.appendChild(script);
  });
}

/** 静态路径边是否已注册（G6 全局只加载一次，注册表随之常驻） */
let routeEdgeRegistered = false;

export function TreeG6({
  state,
  filter,
  maxDepth,
  onOpenPerson,
}: {
  state: FamilyState;
  focusId: string | null;
  filter: LineageFilter;
  maxDepth: number;
  onOpenPerson: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const openRef = useRef(onOpenPerson);
  openRef.current = onOpenPerson;

  useEffect(() => {
    let disposed = false;
    async function boot() {
      const host = hostRef.current;
      if (!host) return;
      const G6 = await loadG6();
      const { Graph, BaseEdge, register, ExtensionCategory } = G6 ?? {};
      if (disposed || !hostRef.current || !Graph || !BaseEdge || !register || !ExtensionCategory) {
        if (!disposed && hostRef.current && (!Graph || !BaseEdge || !register || !ExtensionCategory)) {
          hostRef.current.innerHTML = '<div class="flex h-full items-center justify-center text-caption">G6 不可用：缺少自定义边能力</div>';
        }
        return;
      }

      if (!routeEdgeRegistered) {
        // 自研总线画法的关键：边的几何完全来自 buildRoutes 的 d 路径，
        // G6 不参与连线计算（数据在 lib/g6-scene.ts 里已拆成 path 指令）。
        class RouteEdge extends BaseEdge {
          getKeyPath(attributes: any) {
            // 注意层级：getEdgeData 返回 { data: { path } }，path 在 data.data 里
            const datum = this.context?.graph?.getEdgeData?.(this.id);
            const path = datum?.data?.path;
            if (Array.isArray(path) && path.length > 0) return path;
            // 兜底直线：getEndpoints 返回 [x, y] 数组（与内置 Line 边一致）
            const [source, target] = this.getEndpoints(attributes);
            const px = (p: any) => (Array.isArray(p) ? p[0] : (p?.x ?? 0));
            const py = (p: any) => (Array.isArray(p) ? p[1] : (p?.y ?? 0));
            return [["M", px(source), py(source)], ["L", px(target), py(target)]];
          }
        }
        try {
          register(ExtensionCategory.EDGE, "route-edge", RouteEdge);
          routeEdgeRegistered = true;
        } catch {
          // HMR 会重置模块标志但 G6 注册表还在，重名注册忽略即可
          routeEdgeRegistered = true;
        }
      }

      const scene = buildG6Scene(state, { filter, maxDepth });

      if (graphRef.current) {
        try { graphRef.current.destroy(); } catch { /* ignore */ }
        graphRef.current = null;
      }
      host.innerHTML = "";
      const width = host.clientWidth || 360;
      const height = host.clientHeight || 480;

      const graph = new Graph({
        container: host,
        width,
        height,
        autoFit: "view",
        padding: 24,
        // 不传 layout：节点坐标即 G6Scene 给的 preset 位置，辈分行天然对齐
        data: {
          nodes: [
            ...scene.bands.map((b) => ({
              id: b.id,
              data: { band: true, label: b.label },
              style: { x: b.x, y: b.y, size: [80, 22], draggable: false },
            })),
            ...scene.nodes.map((n) => ({
              id: n.id,
              data: { name: n.name, term: n.term, color: n.color },
              style: { x: n.x, y: n.y, size: [G6_NODE_WIDTH, G6_NODE_HEIGHT] },
            })),
          ],
          edges: scene.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            data: { path: e.path, color: e.color, kind: e.kind },
          })),
        },        node: {
          type: "html",
          style: {
            innerHTML: (d: any) => {
              const n = d?.data ?? {};
              if (n.band) return bandHtml(escapeHtml(String(n.label ?? "")));
              return personHtml(
                escapeHtml(String(n.name ?? d?.id ?? "")),
                escapeHtml(String(n.term ?? "")),
                String(n.color ?? "#64748b")
              );
            },
          },
        },
        edge: {
          type: "route-edge",
          style: {
            stroke: (d: any) => String(d?.data?.color ?? "#64748b"),
            lineWidth: (d: any) => (d?.data?.kind === "spouse" ? 2.2 : 1.8),
            strokeOpacity: (d: any) => (d?.data?.kind === "spouse" ? 0.85 : 0.72),
            strokeLinejoin: "round",
            strokeLinecap: "round",
          },
        },
        // drag-element 移除：手机上单指按到节点会拖走卡片，是误触主源
        behaviors: ["drag-canvas", "zoom-canvas"],
      });
      graph.on("node:click", (evt: any) => {
        const id = evt?.target?.id ?? evt?.item?.id ?? evt?.data?.id;
        if (typeof id === "string" && id && !id.startsWith("band-")) {
          openRef.current(id);
        }
      });
      await graph.render();
      graphRef.current = graph;
    }
    boot().catch((err) => {
      console.error("G6 boot failed", err);
      if (hostRef.current) hostRef.current.innerHTML = '<div class="flex h-full items-center justify-center text-caption">G6 unavailable offline</div>';
    });
    return () => {
      disposed = true;
      if (graphRef.current) {
        try { graphRef.current.destroy(); } catch { /* ignore */ }
        graphRef.current = null;
      }
    };
  }, [state, filter, maxDepth]);

  return (
    <div
      ref={hostRef}
      data-tree-g6
      className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-[var(--glass-edge)] bg-[var(--glass)]/40"
      style={{ height: "100%", minHeight: 360 }}
    />
  );
}
