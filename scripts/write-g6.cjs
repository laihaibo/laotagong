const fs = require("fs");
const ts = `"use client";

import { useEffect, useRef } from "react";
import type { FamilyState } from "@/lib/family";
import { buildKinshipMap } from "@/lib/kinship";
import { type LineageKind, classifyLineage, computeDistances, filterVisibleIds } from "@/lib/lineage";

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

/**
 * AntV G6 ????????????
 * ?????????????? FamilyState / ?????
 */
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
      const { Graph } = await import("@antv/g6");
      if (disposed || !hostRef.current) return;

      const visible = filterVisibleIds(state, filter, maxDepth);
      const distances = computeDistances(state);
      const kinship = buildKinshipMap(state, state.meId);
      const meId = state.meId;

      const nodes = [...visible].map((id) => {
        const p = state.persons[id];
        const lineage = meId
          ? classifyLineage(state, id, meId, distances)
          : ("orphan" as LineageKind);
        const term = kinship.get(id) || "";
        return {
          id,
          data: {
            name: p?.name ?? id,
            term,
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
          edges.push({
            id: "e-f-" + entry.fatherId + "-" + cid,
            source: entry.fatherId,
            target: cid,
            data: { lineage: "paternal" },
          });
        }
        if (entry.motherId && nodeSet.has(entry.motherId)) {
          edges.push({
            id: "e-m-" + entry.motherId + "-" + cid,
            source: entry.motherId,
            target: cid,
            data: { lineage: "maternal" },
          });
        }
      }
      for (const { a, b } of state.spouses) {
        if (!nodeSet.has(a) || !nodeSet.has(b)) continue;
        edges.push({
          id: "e-s-" + a + "-" + b,
          source: a,
          target: b,
          data: { lineage: "spouse" },
        });
      }

      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch {
          /* ignore */
        }
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
              const n = d?.data ?? d;
              const name = n?.name ?? d?.id ?? "";
              const term = n?.term ?? "";
              const color = n?.color ?? "#64748b";
              return (
                '<div style="width:148px;height:64px;border-radius:14px;' +
                "background:linear-gradient(145deg,rgba(255,255,255,0.86),rgba(255,255,255,0.62));" +
                "border:1px solid rgba(255,255,255,0.8);box-shadow:0 8px 24px rgba(15,23,42,0.12);" +
                "border-left:3px solid " +
                color +
                ";padding:8px 10px;font-family:-apple-system,PingFang SC,sans-serif;" +
                "box-sizing:border-box;overflow:hidden;" +
                '">'
              )
                .concat(
                  '<div style="font-size:13px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">',
                  name,
                  "</div>",
                  '<div style="font-size:11px;color:',
                  color,
                  ";margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">",
                  term,
                  "</div></div>"
                );
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
            endArrow: false,
          },
        },
        layout: {
          type: "antv-dagre",
          rankdir: "BT",
          nodesep: 28,
          ranksep: 72,
        },
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
      if (hostRef.current) {
        hostRef.current.innerHTML =
          '<div class="flex h-full items-center justify-center text-caption">G6 ????</div>';
      }
    });

    return () => {
      disposed = true;
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch {
          /* ignore */
        }
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
`;
fs.writeFileSync("D:/XiaomiMiMoProjects/laotagong/components/tree-g6.tsx", ts, "utf8");
console.log("tree-g6 written", ts.length);
