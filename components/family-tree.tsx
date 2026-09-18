"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Crown,
  Info,
  Maximize2,
  Minus,
  Plus,
  Target,
  UserPlus,
} from "lucide-react";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { type FamilyState, type Person, lifespanOf, zodiacOf } from "@/lib/family";
import {
  LINEAGE_FILTERS,
  type LineageFilter,
  type LineageKind,
  generationLabel,
} from "@/lib/lineage";
import { buildKinshipMap } from "@/lib/kinship";
import { type TreeLayout, layoutFamilyTree } from "@/lib/tree";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.18;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.15;

const LINEAGE_STROKE: Record<LineageKind, string> = {
  ego: "var(--line-ego)",
  paternal: "var(--line-paternal)",
  maternal: "var(--line-maternal)",
  descendant: "var(--line-descendant)",
  sibling: "var(--line-other)",
  affinal: "var(--line-spouse)",
  collateral: "var(--line-other)",
  orphan: "var(--line-other)",
};

interface View {
  x: number;
  y: number;
  scale: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export function FamilyTree({
  state,
  focusId,
  onOpenPerson,
  onAddRelation,
  onSetMe,
}: {
  state: FamilyState;
  focusId: string | null;
  onOpenPerson: (id: string) => void;
  onAddRelation: (id: string) => void;
  onSetMe: (id: string) => void;
}) {
  const [filter, setFilter] = useState<LineageFilter>("all");
  const [maxDepth, setMaxDepth] = useState(6);
  const [showMinimap, setShowMinimap] = useState(true);

  const layout = useMemo(
    () => layoutFamilyTree(state, { filter, maxDepth }),
    [state, filter, maxDepth]
  );
const kinship = useMemo(() => buildKinshipMap(state, state.meId), [state]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });

  const centerOn = useCallback(
    (id: string | null, scale?: number) => {
      const node = id ? layout.byId.get(id) : null;
      const el = containerRef.current;
      if (!node || !el) return;
      const rect = el.getBoundingClientRect();
      const nextScale = scale ?? view.scale;
      setView({
        scale: nextScale,
        x: rect.width / 2 - (node.x + node.width / 2) * nextScale,
        y: rect.height / 2 - (node.y + node.height / 2) * nextScale,
      });
    },
    [layout, view.scale]
  );

  const fitAll = useCallback(() => {
    const el = containerRef.current;
    if (!el || layout.width === 0 || layout.height === 0) return;
    const rect = el.getBoundingClientRect();
    const scale = clamp(
      Math.min(rect.width / layout.width, rect.height / layout.height),
      MIN_SCALE,
      MAX_SCALE
    );
    setView({
      scale,
      x: (rect.width - layout.width * scale) / 2,
      y: (rect.height - layout.height * scale) / 2,
    });
  }, [layout]);

  const didInit = useRef(false);
  useEffect(() => {
    if (layout.byId.size === 0) return;
    if (!didInit.current) {
      didInit.current = true;
      centerOn(state.meId ?? focusId, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => {
    if (!focusId || !layout.byId.has(focusId)) return;
    centerOn(focusId);
  }, [focusId, layout, centerOn]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panOrigin = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pinchOrigin = useRef<{ distance: number; scale: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointerId 失效 */
    }
    if (pointers.current.size === 1) {
      panOrigin.current = {
        x: event.clientX,
        y: event.clientY,
        vx: view.x,
        vy: view.y,
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchOrigin.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: view.scale,
      };
      panOrigin.current = null;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinchOrigin.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = distance / (pinchOrigin.current.distance || 1);
      const scale = clamp(pinchOrigin.current.scale * ratio, MIN_SCALE, MAX_SCALE);
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (a.x + b.x) / 2 - rect.left;
      const py = (a.y + b.y) / 2 - rect.top;
      setView((v) => {
        const k = scale / v.scale;
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
      return;
    }

    if (panOrigin.current) {
      const origin = panOrigin.current;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      setView((v) => ({ ...v, x: origin.vx + dx, y: origin.vy + dy }));
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchOrigin.current = null;
    if (pointers.current.size === 0) panOrigin.current = null;
  };

  const zoomCenter = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  if (layout.nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-body text-[var(--ink-faint)]">当前筛选下没有成员</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* 筛选条：亲系 + 代数 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {LINEAGE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "h-8 rounded-full px-3 text-caption transition-all",
              filter === f.id
                ? "glass-btn text-[var(--ink)]"
                : "border border-[var(--glass-border)] text-[var(--ink-soft)] hover:bg-[var(--glass-strong)]"
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-[var(--glass-edge)]" />
        <button
          type="button"
          className="h-8 rounded-full border border-[var(--glass-border)] px-3 text-caption text-[var(--ink-soft)]"
          onClick={() => setMaxDepth((d) => (d >= 8 ? 2 : d + 1))}
          title="每点一次增加一代"
        >
          ±{maxDepth} 代
        </button>
        <button
          type="button"
          className="h-8 rounded-full border border-[var(--glass-border)] px-3 text-caption text-[var(--ink-soft)]"
          onClick={() => setShowMinimap((v) => !v)}
        >
          小地图
        </button>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[var(--ink-faint)]">
          <LegendDot color="var(--line-paternal)" label="父系" />
          <LegendDot color="var(--line-maternal)" label="母系" />
          <LegendDot color="var(--line-spouse)" label="姻亲" />
          <LegendDot color="var(--line-descendant)" label="后裔" />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--glass-edge)] bg-[var(--glass)]/40">
        <div
          ref={containerRef}
          data-tree-canvas
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
        >
          <div
            className="absolute left-0 top-0"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transformOrigin: "0 0",
              width: layout.width,
              height: layout.height,
            }}
          >
            <TreeScene
              layout={layout}
              persons={state.persons}
              meId={state.meId}
              focusId={focusId}
              kinship={kinship}
              onOpenPerson={onOpenPerson}
              onAddRelation={onAddRelation}
              onSetMe={onSetMe}
            />
          </div>
        </div>

        {showMinimap && (
          <Minimap
            layout={layout}
            view={view}
            viewport={
              containerRef.current
                ? {
                    w: containerRef.current.clientWidth,
                    h: containerRef.current.clientHeight,
                  }
                : { w: 0, h: 0 }
            }
            onJump={(x, y) => {
              const el = containerRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              setView((v) => ({
                ...v,
                x: rect.width / 2 - x * v.scale,
                y: rect.height / 2 - y * v.scale,
              }));
            }}
          />
        )}

        <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col gap-1.5">
          <Button variant="glass" size="icon-sm" className="pointer-events-auto" onClick={() => zoomCenter(ZOOM_STEP)} title="放大">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="glass" size="icon-sm" className="pointer-events-auto" onClick={() => zoomCenter(1 / ZOOM_STEP)} title="缩小">
            <Minus className="h-4 w-4" />
          </Button>
          <Button variant="glass" size="icon-sm" className="pointer-events-auto" onClick={fitAll} title="看全族">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="glass"
            size="icon-sm"
            className="pointer-events-auto"
            onClick={() => centerOn(state.meId ?? focusId, 1)}
            title="回到「我」"
          >
            <Target className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Minimap({
  layout,
  view,
  viewport,
  onJump,
}: {
  layout: TreeLayout;
  view: View;
  viewport: { w: number; h: number };
  onJump: (x: number, y: number) => void;
}) {
  const W = 112;
  const H = 80;
  const sx = layout.width > 0 ? W / layout.width : 1;
  const sy = layout.height > 0 ? H / layout.height : 1;
  const s = Math.min(sx, sy);
  const vx = (-view.x / view.scale) * s;
  const vy = (-view.y / view.scale) * s;
  const vw = (viewport.w / view.scale) * s;
  const vh = (viewport.h / view.scale) * s;

  return (
    <button
      type="button"
      className="glass pointer-events-auto absolute bottom-3 left-3 overflow-hidden rounded-xl"
      style={{ width: W, height: H }}
      title="点击跳转"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / s) + (layout.width > 0 ? 0 : 0);
        const py = (e.clientY - rect.top) / s;
        onJump(px, py);
      }}
    >
      <svg width={W} height={H} className="absolute inset-0">
        {layout.nodes.map((n) => (
          <rect
            key={n.id}
            x={n.x * s}
            y={n.y * s}
            width={Math.max(2, n.width * s)}
            height={Math.max(2, n.height * s)}
            rx={1}
            fill={LINEAGE_STROKE[n.lineage] ?? "var(--line-other)"}
            opacity={n.lineage === "ego" ? 0.95 : 0.45}
          />
        ))}
        <rect
          x={vx}
          y={vy}
          width={Math.max(8, vw)}
          height={Math.max(6, vh)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.2}
        />
      </svg>
    </button>
  );
}

const TreeScene = memo(function TreeScene({
  layout,
  persons,
  meId,
  focusId,
  kinship,
  onOpenPerson,
  onAddRelation,
  onSetMe,
}: {
  layout: TreeLayout;
  persons: Record<string, Person>;
  meId: string | null;
  focusId: string | null;
  kinship: Map<string, string>;
  onOpenPerson: (id: string) => void;
  onAddRelation: (id: string) => void;
  onSetMe: (id: string) => void;
}) {
  const junctionById = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const j of layout.junctions) m.set(j.id, { x: j.x, y: j.y });
    return m;
  }, [layout.junctions]);

  return (
    <>
      {/* 代际带 */}
      {layout.bands.map((band) => (
        <div
          key={`band-${band.generation}`}
          className="pointer-events-none absolute left-0 w-full"
          style={{
            top: band.y - 22,
            height: 22,
            opacity: 0.7,
          }}
        >
          <div className="flex h-full items-end px-2">
            <span className="rounded-t-md bg-[var(--glass-strong)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--ink-faint)]">
              {band.label}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 h-px w-full bg-[var(--glass-edge)]" />
        </div>
      ))}

      <svg
        className="pointer-events-none absolute left-0 top-0"
        width={layout.width}
        height={layout.height}
        aria-hidden
      >
        {layout.edges.map((edge, index) => {
          const stroke = LINEAGE_STROKE[edge.lineage] ?? "var(--line-other)";
          if (edge.kind === "spouse") {
            const from = layout.byId.get(edge.fromId);
            const to = layout.byId.get(edge.toId);
            if (!from || !to) return null;
            return (
              <line
                key={`s-${index}`}
                x1={from.x + from.width}
                y1={from.y + from.height / 2}
                x2={to.x}
                y2={to.y + to.height / 2}
                stroke="var(--line-spouse)"
                strokeWidth={2}
                strokeOpacity={0.7}
              />
            );
          }
          // junction 边由下方 junction 总线统一绘制，避免重复
          if (edge.kind === "junction") return null;

          const from = layout.byId.get(edge.fromId);
          const to = layout.byId.get(edge.toId);
          if (!from || !to) return null;
          const hasJunction = layout.junctions.some(
            (j) => j.childIds.includes(edge.toId) && j.parentIds.includes(edge.fromId)
          );
          if (hasJunction) return null;
          const pline = layout.lineageOf.get(edge.fromId);
          const fx =
            pline === "paternal"
              ? from.x + from.width * 0.28
              : pline === "maternal"
                ? from.x + from.width * 0.72
                : from.x + from.width / 2;
          const fy = from.y + from.height;
          const tx =
            pline === "paternal"
              ? to.x + to.width * 0.28
              : pline === "maternal"
                ? to.x + to.width * 0.72
                : to.x + to.width / 2;
          const ty = to.y;
          // 无汇合点的单亲连线：按子女 id 错开水平通道
          const hash = edge.toId.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
          const lane = fy + (ty - fy) * 0.35 + (hash % 5) * 8;
          return (
            <path
              key={`b-${index}`}
              d={`M ${fx} ${fy} V ${lane} H ${tx} V ${ty}`}
              fill="none"
              stroke={stroke}
              strokeWidth={1.75}
              strokeOpacity={0.5}
            />
          );
        })}

        {/* 亲子总线：家长分车道下落 → 横向总线 → 各子女分叉 */}
        {layout.junctions.map((j) => {
          const stroke = LINEAGE_STROKE[j.lineage] ?? "var(--line-other)";
          return (
            <g key={j.id} stroke={stroke} strokeWidth={1.85} strokeOpacity={0.62} fill="none">
              <line x1={j.busLeft} y1={j.busY} x2={j.busRight} y2={j.busY} />
              {j.parentLanes.map((lane) => {
                const parent = layout.byId.get(lane.parentId);
                if (!parent) return null;
                const cx = parent.x + parent.width / 2;
                return (
                  <path
                    key={`pl-${j.id}-${lane.parentId}`}
                    d={`M ${cx} ${parent.y + parent.height} V ${lane.laneY} H ${lane.x} V ${j.busY}`}
                  />
                );
              })}
              {j.childIds.map((cid) => {
                const child = layout.byId.get(cid);
                if (!child) return null;
                // 必须与布局端 childAttach 一致，且总线已覆盖该点，否则线会断开
                const cx =
                  j.childAttach?.[cid] ?? child.x + child.width / 2;
                return (
                  <path
                    key={`cl-${j.id}-${cid}`}
                    d={`M ${cx} ${j.busY} V ${child.y}`}
                  />
                );
              })}
            </g>
          );
        })}
        {/* 汇合点圆点 */}
        {layout.junctions.map((j) => (
          <circle
            key={j.id}
            cx={j.x}
            cy={j.y}
            r={3}
            fill={LINEAGE_STROKE[j.lineage] ?? "var(--line-other)"}
            opacity={0.85}
          />
        ))}
      </svg>

      {layout.nodes.map((node) => {
        const person = persons[node.id];
        if (!person) return null;
        const isMe = meId === node.id;
        const isFocus = focusId === node.id;
        const years =
          person.birthYear || person.deathYear
            ? `${person.birthYear || "?"}–${person.deathYear || ""}`
            : "";
        const age = lifespanOf(person);
        const zodiac = zodiacOf(person.birthYear);
        const lineage = node.lineage;

        return (
          <div
            key={node.id}
            data-tree-node
            data-lineage={lineage}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              width: node.width,
              height: node.height,
              borderLeft: `3px solid ${LINEAGE_STROKE[lineage] ?? "transparent"}`,
            }}
            className={cn(
              "glass-card absolute flex items-stretch overflow-hidden rounded-2xl",
              isMe && "me",
              isFocus && "focused"
            )}
          >
            <button
              type="button"
              onClick={() => onOpenPerson(node.id)}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 text-center"
            >
              <Avatar person={person} size={isMe ? "sm" : "xs"} />
              <span className="w-full truncate text-caption font-medium text-[var(--ink)]">
                {person.name}
              </span>
              {years && (
                <span className="w-full truncate text-caption text-[var(--ink-faint)]">
                  {years}
                  {age !== null && ` · ${age}`}
                  {zodiac && ` · ${zodiac.label}`}
                </span>
              )}
              <span className="w-full truncate text-caption font-medium text-[var(--accent)]">
                {kinship.get(node.id) || (isMe ? "我" : lineageLabel(lineage) || generationLabel(node.generation))}
              </span>
            </button>

            <div
              className="flex w-11 shrink-0 flex-col border-l border-[var(--glass-edge)]"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => onAddRelation(node.id)}
                title="增加关系"
                className="flex flex-1 items-center justify-center text-[var(--ink-soft)] transition-colors hover:bg-[var(--glass-strong)] hover:text-[var(--ink)]"
              >
                <UserPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpenPerson(node.id)}
                title="详情"
                className="flex flex-1 items-center justify-center text-[var(--ink-soft)] transition-colors hover:bg-[var(--glass-strong)] hover:text-[var(--ink)]"
              >
                <Info className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSetMe(node.id)}
                disabled={isMe}
                title="设为「我」"
                className="flex flex-1 items-center justify-center text-[var(--ink-soft)] transition-colors hover:bg-[var(--glass-strong)] hover:text-[var(--accent)] disabled:opacity-30"
              >
                <Crown className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
});

function lineageLabel(kind: LineageKind): string {
  const map: Record<LineageKind, string> = {
    ego: "我",
    paternal: "父系",
    maternal: "母系",
    descendant: "后裔",
    sibling: "同辈",
    affinal: "姻亲",
    collateral: "旁系",
    orphan: "",
  };
  return map[kind] ?? "";
}
