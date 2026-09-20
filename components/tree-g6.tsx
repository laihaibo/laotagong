"use client";

import { useEffect, useRef } from "react";
import type { FamilyState } from "@/lib/family";
import { buildKinshipMap } from "@/lib/kinship";
import {
  type LineageKind,
  classifyLineage,
  computeDistances,
  filterVisibleIds,
} from "@/lib/lineage";

const G6_CDN = "https://cdn.jsdelivr.net/npm/@antv/g6@5.0.49/dist/g6.min.js";

const LINEAGE_COLOR: Record<string, string> = {
  ego: "#2563eb",
  paternal: "#0284c7",
  maternal: "#c026d3",
  descendant: "#059669",
  sibling: "#64748b",
  affinal: "#d97706",
  collateral: "#64748b",
  orphan: "#94a3b8",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function nodeHtml(name: string, term: string, color: string): string {
  const head = '<div style="width:148px;height:64px;border-radius:14px;background:linear-gradient(145deg,rgba(255,255,255,0.88),rgba(255,255,255,0.64));border:1px solid rgba(255,255,255,0.85);box-shadow:0 8px 24px rgba(15,23,42,0.12);border-left:3px solid ';
  return head + color + ';padding:8px 10px;box-sizing:border-box;overflow:hidden;font-family:-apple-system,PingFang SC,sans-serif;"><div style="font-size:13px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</div><div style="font-size:11px;color:' + color + ';margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + term + '</div></div>';
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

export function TreeG6({
  state,
  focusId,
  filter,
  maxDepth,
  onOpenPerson,
}: {
  state: FamilyState;
  focusId: string | null;
  filter: "all" | "paternal" | "maternal" | "direct";
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
      const Graph = G6?.Graph;
      if (disposed || !hostRef.current || !Graph) return;

      const visible = filterVisibleIds(state, filter, maxDepth);
      const distances = computeDistances(state);
      const kinship = buildKinshipMap(state, state.meId);
      const meId = state.meId;
      const nodes = [...visible].map((id) => {
        const p = state.persons[id];
        const lineage: LineageKind = meId ? classifyLineage(state, id, meId, distances) : "orphan";
        return {
          id,
          data: {
            name: p?.name ?? id,
            term: kinship.get(id) || "",
            lineage,
            color: LINEAGE_COLOR[lineage] ?? LINEAGE_COLOR.orphan,
          },
        };
      });
      const nodeSet = new Set(nodes.map((n) => n.id));
      const edges: any[] = [];
      for (const [cid, entry] of Object.entries(state.parents)) {
        if (!nodeSet.has(cid)) continue;
        if (entry.fatherId && nodeSet.has(entry.fatherId)) {
          edges.push({ id: "ef-" + entry.fatherId + "-" + cid, source: entry.fatherId, target: cid, data: { lineage: "paternal" } });
        }
        if (entry.motherId && nodeSet.has(entry.motherId)) {
          edges.push({ id: "em-" + entry.motherId + "-" + cid, source: entry.motherId, target: cid, data: { lineage: "maternal" } });
        }
      }
      for (const s of state.spouses) {
        if (!nodeSet.has(s.a) || !nodeSet.has(s.b)) continue;
        edges.push({ id: "es-" + s.a + "-" + s.b, source: s.a, target: s.b, data: { lineage: "spouse" } });
      }
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
        data: { nodes, edges },
        node: {
          type: "html",
          style: {
            size: [148, 64],
            innerHTML: (d: any) => {
              const n = d?.data ?? d ?? {};
              return nodeHtml(escapeHtml(String(n.name ?? d?.id ?? "")), escapeHtml(String(n.term ?? "")), String(n.color ?? "#64748b"));
            },
          },
        },
        edge: {
          type: "line",
          style: {
            stroke: (d: any) => {
              const lin = d?.data?.lineage;
              if (lin === "spouse") return "#d97706";
              if (lin === "maternal") return "#c026d3";
              return "#0284c7";
            },
            lineWidth: 1.6,
          },
        },
        layout: { type: "dagre", rankdir: "TB", nodesep: 28, ranksep: 72 },
        behaviors: ["drag-canvas", "zoom-canvas", "drag-element"],
      });
      graph.on("node:click", (evt: any) => {
        const id = evt?.target?.id ?? evt?.item?.id ?? evt?.data?.id;
        if (id) openRef.current(String(id));
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
  }, [state, filter, maxDepth, focusId]);

  return (
    <div
      ref={hostRef}
      data-tree-g6
      className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-[var(--glass-edge)] bg-[var(--glass)]/40"
      style={{ height: "100%", minHeight: 360 }}
    />
  );
}
