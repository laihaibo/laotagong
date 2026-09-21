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
import { TreeG6 } from "@/components/tree-g6";
import { type LayoutMode } from "@/lib/layout-mode";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.18;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.15;
/**
 * 点按与拖拽的判定阈值：位移超过它算拖拽，抬手时吞掉紧随其后的 click。
 * 手机上想平移画布、手指按在卡片上轻微抖动时，浏览器仍会派发 click，
 * 不吞掉就会误开人物详情——这是移动端误触的主源头。
 */
const CLICK_SLOP = 8;

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
  layoutMode = "custom",
}: {
  state: FamilyState;
  focusId: string | null;
  onOpenPerson: (id: string) => void;
  onAddRelation: (id: string) => void;
  onSetMe: (id: string) => void;
  layoutMode?: LayoutMode;
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
  /** 本轮手势里指针离按下点的最远位移；抬手时据此决定是否吞掉 click */
  const dragDistance = useRef(0);
  const suppressClick = useRef(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointerId 失效 */
    }
    if (pointers.current.size === 1) {
      dragDistance.current = 0;
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
      dragDistance.current = Math.max(dragDistance.current, Math.hypot(dx, dy));
      setView((v) => ({ ...v, x: origin.vx + dx, y: origin.vy + dy }));
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchOrigin.current = null;
    if (pointers.current.size === 0) {
      panOrigin.current = null;
      // click 在 pointerup 之后派发：这里置好的标记正好被卡片 onClick 读到。
      // 每次抬手都重算并清零，动作栏按钮（pointerdown 被拦截、不走平移）不受影响。
      suppressClick.current = dragDistance.current > CLICK_SLOP;
      dragDistance.current = 0;
    }
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
        {/* 布局引擎的切换入口在「设置」弹窗里；工具条上不再放假的指示 chips */}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[var(--ink-faint)] sm:gap-3">
          <LegendDot color="var(--line-paternal)" label="父系" />
          <LegendDot color="var(--line-maternal)" label="母系" />
          <LegendDot color="var(--line-spouse)" label="姻亲" />
          <LegendDot color="var(--line-descendant)" label="后裔" />
        </div>
      </div>

      {layoutMode === "g6" ? (
        <TreeG6
          state={state}
          focusId={focusId}
          filter={filter}
          maxDepth={maxDepth}
          onOpenPerson={onOpenPerson}
        />
      ) : (
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
              suppressClickRef={suppressClick}
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
          {/* icon-sm(28px) 在手机上太小，换 h-10 w-10 的 40px 触控目标 */}
          <Button variant="glass" size="icon" className="pointer-events-auto h-10 w-10" onClick={() => zoomCenter(ZOOM_STEP)} title="放大">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="glass" size="icon" className="pointer-events-auto h-10 w-10" onClick={() => zoomCenter(1 / ZOOM_STEP)} title="缩小">
            <Minus className="h-4 w-4" />
          </Button>
          <Button variant="glass" size="icon" className="pointer-events-auto h-10 w-10" onClick={fitAll} title="看全族">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="glass"
            size="icon"
            className="pointer-events-auto h-10 w-10"
            onClick={() => centerOn(state.meId ?? focusId, 1)}
            title="回到「我」"
          >
            <Target className="h-4 w-4" />
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    // 窄屏只留色点，文字收进 title（悬停/长按可见），给筛选 chips 腾空间
    <span className="inline-flex items-center gap-1" title={label}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="hidden sm:inline">{label}</span>
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
        const px = (e.clientX - rect.left) / s;
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
  suppressClickRef,
  onOpenPerson,
  onAddRelation,
  onSetMe,
}: {
  layout: TreeLayout;
  persons: Record<string, Person>;
  meId: string | null;
  focusId: string | null;
  kinship: Map<string, string>;
  suppressClickRef: React.RefObject<boolean>;
  onOpenPerson: (id: string) => void;
  onAddRelation: (id: string) => void;
  onSetMe: (id: string) => void;
}) {
  return (
    <>
      {layout.bands.map((band) => (
        <div
          key={"band-" + band.generation}
          className="pointer-events-none absolute left-0 w-full"
          style={{ top: band.y - 30, height: 22, opacity: 0.7 }}
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
        {(layout.routes ?? []).map((route) => {
          const stroke =
            route.kind === "spouse"
              ? "var(--line-spouse)"
              : LINEAGE_STROKE[route.lineage] ?? "var(--line-other)";
          return (
            <path
              key={route.id}
              d={route.d}
              fill="none"
              stroke={stroke}
              strokeWidth={route.kind === "spouse" ? 2.2 : 1.8}
              strokeOpacity={route.kind === "spouse" ? 0.85 : 0.72}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {layout.nodes.map((node) => {
        const person = persons[node.id];
        if (!person) return null;
        const isMe = meId === node.id;
        const isFocus = focusId === node.id;
        const yearsText =
          person.birthYear || person.deathYear
            ? (person.birthYear || "?") + "–" + (person.deathYear || "")
            : "";
        const age = lifespanOf(person);
        const zodiac = zodiacOf(person.birthYear);
        const lineage = node.lineage;
        const term = kinship.get(node.id) || lineageLabel(lineage) || "";

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
              borderLeft: "3px solid " + (LINEAGE_STROKE[lineage] ?? "transparent"),
            }}
            className={cn(
              "glass-card absolute flex items-stretch overflow-hidden rounded-2xl",
              isMe && "me",
              isFocus && "focused"
            )}
          >
            <button
              type="button"
              onClick={() => {
                // 拖拽平移后的 click 不是「点开」，直接吞掉（见 CLICK_SLOP）
                if (suppressClickRef.current) return;
                onOpenPerson(node.id);
              }}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 text-center"
            >
              <Avatar person={person} size={isMe ? "sm" : "xs"} />
              <span className="w-full truncate text-caption font-medium text-[var(--ink)]">
                {person.name}
              </span>
              {yearsText ? (
                <span className="w-full truncate text-caption text-[var(--ink-faint)]">
                  {yearsText}
                  {age !== null && " \u00b7 " + age}
                  {zodiac && " \u00b7 " + zodiac.label}
                </span>
              ) : null}
              <span className="w-full truncate text-caption font-medium text-[var(--accent)]">
                {term}
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
