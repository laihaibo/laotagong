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
import {
  type FamilyState,
  type Person,
  type WufuGrade,
  type WufuResult,
  buildWufuMap,
  lifespanOf,
  zodiacOf,
} from "@/lib/family";
import {
  LINEAGE_FILTERS,
  type LineageFilter,
  type LineageKind,
  generationLabel,
} from "@/lib/lineage";
import { buildKinshipMap } from "@/lib/kinship";
import { type TreeLayout, layoutFamilyTree } from "@/lib/tree";
import {
  MAX_GENERATIONS,
  MIN_GENERATIONS,
  loadViewPrefs,
  saveViewPrefs,
} from "@/lib/view-prefs";
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
/** 滚轮缩放改为按滚动量连续缩放：factor = exp(-deltaY * RATE)，触控板小步长也顺滑 */
const WHEEL_ZOOM_RATE = 0.0022;
/** 惯性滑行：释放速度阈值（px/ms）、每 16ms 摩擦系数、最长帧数保险 */
const MOMENTUM_MIN_SPEED = 0.25;
const MOMENTUM_FRICTION = 0.93;
const MOMENTUM_MAX_FRAMES = 120;
/** 飞行动画时长与卡片精简的缩放阈值 */
const FLY_DURATION = 350;
const COMPACT_SCALE = 0.5;

const LINEAGE_STROKE: Record<LineageKind, string> = {
  ego: "var(--line-ego)",
  paternal: "var(--line-paternal)",
  maternal: "var(--line-maternal)",
  descendant: "var(--line-descendant)",
  sibling: "var(--line-collateral)",
  affinal: "var(--line-spouse)",
  collateral: "var(--line-collateral)",
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
  showMinimap = true,
  onOpenPerson,
  onAddRelation,
  onSetMe,
}: {
  state: FamilyState;
  focusId: string | null;
  /** 小地图显隐由「设置」弹窗控制（family-app 持久化到 view-prefs） */
  showMinimap?: boolean;
  onOpenPerson: (id: string) => void;
  onAddRelation: (id: string) => void;
  onSetMe: (id: string) => void;
}) {
  const [filter, setFilter] = useState<LineageFilter>("all");
  const [maxDepth, setMaxDepth] = useState(() => loadViewPrefs().maxDepth);
  const [onlyWufu, setOnlyWufu] = useState(false);
  /** 拖拽/捏合进行中：期间关掉卡片位置过渡，避免布局过渡和平移打架 */
  const [gesturing, setGesturing] = useState(false);

  const wufu = useMemo(() => buildWufuMap(state), [state]);
  const layout = useMemo(
    () =>
      layoutFamilyTree(state, {
        filter,
        maxDepth,
        wufu: onlyWufu ? wufu : undefined,
      }),
    [state, filter, maxDepth, onlyWufu, wufu]
  );
  const kinship = useMemo(() => buildKinshipMap(state, state.meId), [state]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  /** 动画/惯性需要的最新 view；updater 必须是纯函数，所以别在 updater 里读它 */
  const viewRef = useRef(view);
  viewRef.current = view;

  const flyRaf = useRef<number | null>(null);
  const momentumRaf = useRef<number | null>(null);
  const stopFly = () => {
    if (flyRaf.current !== null) {
      cancelAnimationFrame(flyRaf.current);
      flyRaf.current = null;
    }
  };
  const stopMomentum = () => {
    if (momentumRaf.current !== null) {
      cancelAnimationFrame(momentumRaf.current);
      momentumRaf.current = null;
    }
  };

  /** 缓动飞行：回到我 / 看全族 / 小地图跳转 / 缩放按钮都用它，替代瞬移 */
  const flyTo = useCallback((target: View, duration = FLY_DURATION) => {
    stopFly();
    stopMomentum();
    const from = viewRef.current;
    if (
      Math.abs(from.x - target.x) < 0.5 &&
      Math.abs(from.y - target.y) < 0.5 &&
      Math.abs(from.scale - target.scale) < 0.001
    ) {
      setView(target);
      return;
    }
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const p = duration > 0 ? Math.min(1, (now - t0) / duration) : 1;
      const k = ease(p);
      setView({
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
        scale: from.scale + (target.scale - from.scale) * k,
      });
      flyRaf.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    flyRaf.current = requestAnimationFrame(step);
  }, []);

  useEffect(
    () => () => {
      stopFly();
      stopMomentum();
    },
    []
  );

  const changeGenerations = useCallback((next: number) => {
    const value = clamp(Math.round(next), MIN_GENERATIONS, MAX_GENERATIONS);
    setMaxDepth(value);
    saveViewPrefs({ maxDepth: value });
  }, []);

  const centerOn = useCallback(
    (id: string | null, scale?: number, animate = true) => {
      const node = id ? layout.byId.get(id) : null;
      const el = containerRef.current;
      if (!node || !el) return;
      const rect = el.getBoundingClientRect();
      const nextScale = scale ?? viewRef.current.scale;
      const target: View = {
        scale: nextScale,
        x: rect.width / 2 - (node.x + node.width / 2) * nextScale,
        y: rect.height / 2 - (node.y + node.height / 2) * nextScale,
      };
      if (animate) flyTo(target);
      else setView(target);
    },
    [layout, flyTo]
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
    flyTo({
      scale,
      x: (rect.width - layout.width * scale) / 2,
      y: (rect.height - layout.height * scale) / 2,
    });
  }, [layout, flyTo]);

  const didInit = useRef(false);
  useEffect(() => {
    if (layout.byId.size === 0) return;
    if (!didInit.current) {
      didInit.current = true;
      // 首帧直接就位，不播放飞行动画
      centerOn(state.meId ?? focusId, 1, false);
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
    stopFly();
    stopMomentum();
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  const zoomCenter = useCallback(
    (factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = rect.width / 2;
      const py = rect.height / 2;
      const v = viewRef.current;
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      flyTo({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    },
    [flyTo]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      // Shift+滚轮 = 横向平移：族谱的宽度经常超出视口
      if (event.shiftKey && !event.ctrlKey) {
        setView((v) => ({ ...v, x: v.x - dy }));
        return;
      }
      // 触控板捏合手势带 ctrlKey；与滚轮统一按滚动量连续缩放
      const factor = clamp(Math.exp(-dy * WHEEL_ZOOM_RATE), 0.5, 2);
      zoomAt(event.clientX, event.clientY, factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // 桌面键盘快捷键：方向键平移、+/- 缩放、0 回到「我」
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      // 有弹窗打开时不抢按键
      if (document.querySelector("[role='dialog']")) return;
      const pan = 60;
      switch (event.key) {
        case "ArrowLeft":
          setView((v) => ({ ...v, x: v.x + pan }));
          break;
        case "ArrowRight":
          setView((v) => ({ ...v, x: v.x - pan }));
          break;
        case "ArrowUp":
          setView((v) => ({ ...v, y: v.y + pan }));
          break;
        case "ArrowDown":
          setView((v) => ({ ...v, y: v.y - pan }));
          break;
        case "+":
        case "=":
          zoomCenter(ZOOM_STEP);
          break;
        case "-":
        case "_":
          zoomCenter(1 / ZOOM_STEP);
          break;
        case "0":
          centerOn(state.meId ?? focusId, 1);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomCenter, centerOn, state.meId, focusId]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panOrigin = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pinchOrigin = useRef<{ distance: number; scale: number } | null>(null);
  /** 本轮手势里指针离按下点的最远位移；抬手时据此决定是否吞掉 click */
  const dragDistance = useRef(0);
  const suppressClick = useRef(false);
  /** 单指拖动的释放速度（px/ms），够快才触发惯性滑行 */
  const panVelocity = useRef({ x: 0, y: 0 });
  const lastSample = useRef<{ x: number; y: number; t: number } | null>(null);

  const startMomentum = (vx0: number, vy0: number) => {
    stopMomentum();
    let vx = vx0;
    let vy = vy0;
    let last = performance.now();
    let frames = 0;
    const step = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      frames += 1;
      setView((v) => ({ ...v, x: v.x + vx * dt, y: v.y + vy * dt }));
      const decay = Math.pow(MOMENTUM_FRICTION, dt / 16.7);
      vx *= decay;
      vy *= decay;
      if (frames < MOMENTUM_MAX_FRAMES && Math.hypot(vx, vy) > 0.02) {
        momentumRaf.current = requestAnimationFrame(step);
      } else {
        momentumRaf.current = null;
      }
    };
    momentumRaf.current = requestAnimationFrame(step);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    stopFly();
    stopMomentum();
    setGesturing(true);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointerId 失效 */
    }
    if (pointers.current.size === 1) {
      dragDistance.current = 0;
      panVelocity.current = { x: 0, y: 0 };
      lastSample.current = {
        x: event.clientX,
        y: event.clientY,
        t: event.timeStamp,
      };
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
      // 速度采样：间隔 <4ms 的样本（合成事件/高报告率）跳过，避免除零放大
      const t = event.timeStamp;
      const s = lastSample.current;
      if (s && t - s.t >= 4) {
        const dt = t - s.t;
        panVelocity.current = {
          x: clamp(
            panVelocity.current.x * 0.5 + ((event.clientX - s.x) / dt) * 0.5,
            -3,
            3
          ),
          y: clamp(
            panVelocity.current.y * 0.5 + ((event.clientY - s.y) / dt) * 0.5,
            -3,
            3
          ),
        };
        lastSample.current = { x: event.clientX, y: event.clientY, t };
      }
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchOrigin.current = null;
    if (pointers.current.size === 0) {
      panOrigin.current = null;
      setGesturing(false);
      // click 在 pointerup 之后派发：这里置好的标记正好被卡片 onClick 读到。
      // 每次抬手都重算并清零，动作栏按钮（pointerdown 被拦截、不走平移）不受影响。
      const flicked = dragDistance.current > CLICK_SLOP;
      suppressClick.current = flicked;
      // 惯性只在真实拖动后的 pointerup 触发；pointercancel 与轻点不滑行
      const v = panVelocity.current;
      if (
        event.type === "pointerup" &&
        flicked &&
        Math.hypot(v.x, v.y) > MOMENTUM_MIN_SPEED
      ) {
        startMomentum(v.x, v.y);
      }
      dragDistance.current = 0;
      lastSample.current = null;
      panVelocity.current = { x: 0, y: 0 };
    }
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
        <div
          className="flex h-8 items-center rounded-full border border-[var(--glass-border)] text-caption text-[var(--ink-soft)]"
          title="显示的世代范围"
        >
          <button
            type="button"
            className="flex h-full w-7 items-center justify-center disabled:opacity-30"
            onClick={() => changeGenerations(maxDepth - 1)}
            disabled={maxDepth <= MIN_GENERATIONS}
            title="减少一代"
          >
            −
          </button>
          <span className="min-w-11 text-center tabular-nums">±{maxDepth} 代</span>
          <button
            type="button"
            className="flex h-full w-7 items-center justify-center disabled:opacity-30"
            onClick={() => changeGenerations(maxDepth + 1)}
            disabled={maxDepth >= MAX_GENERATIONS}
            title="增加一代"
          >
            ＋
          </button>
        </div>
        <button
          type="button"
          onClick={() => setOnlyWufu((v) => !v)}
          className={cn(
            "h-8 rounded-full px-3 text-caption transition-all",
            onlyWufu
              ? "glass-btn text-[var(--ink)]"
              : "border border-[var(--glass-border)] text-[var(--ink-soft)] hover:bg-[var(--glass-strong)]"
          )}
          title="只显示出服以内的亲人（含配偶）"
        >
          五服内
        </button>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[var(--ink-faint)] sm:gap-3">
          <LegendDot color="var(--line-paternal)" label="父系" />
          <LegendDot color="var(--line-maternal)" label="母系" />
          <LegendDot color="var(--line-spouse)" label="姻亲" />
          <LegendDot color="var(--line-descendant)" label="后裔" />
          <LegendDot color="var(--line-collateral)" label="旁系" />
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
              wufu={wufu}
              compact={view.scale < COMPACT_SCALE}
              animateLayout={!gesturing}
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
              const scale = viewRef.current.scale;
              flyTo({
                scale,
                x: rect.width / 2 - x * scale,
                y: rect.height / 2 - y * scale,
              });
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
  wufu,
  compact,
  animateLayout,
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
  wufu: Map<string, WufuResult>;
  /** 缩得很小时隐藏生卒年等次要文字，防止卡片挤成一团 */
  compact: boolean;
  /** 非手势期间开卡片位置过渡：筛选/代数切换时平滑滑到新布局 */
  animateLayout: boolean;
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
        const wufuResult = wufu.get(node.id);

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
              // 位置过渡只作用在卡片自身坐标上；平移/缩放走外层 transform，互不影响
              transition: animateLayout
                ? "left 280ms cubic-bezier(0.22, 1, 0.36, 1), top 280ms cubic-bezier(0.22, 1, 0.36, 1)"
                : undefined,
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
              {!compact && yearsText ? (
                <span className="w-full truncate text-caption text-[var(--ink-faint)]">
                  {yearsText}
                  {age !== null && " \u00b7 " + age}
                  {zodiac && " \u00b7 " + zodiac.label}
                </span>
              ) : null}
              <span className="flex w-full items-center justify-center gap-1">
                <span className="min-w-0 truncate text-caption font-medium text-[var(--accent)]">
                  {term}
                </span>
                {wufuResult && (
                  <span
                    className="shrink-0 rounded-full border px-1.5 text-[10px] leading-4"
                    style={wufuBadgeStyle(wufuResult.grade)}
                    title={`五服 · ${wufuResult.grade}${
                      wufuResult.months && wufuResult.months !== "—"
                        ? "（" + wufuResult.months + "）"
                        : ""
                    }`}
                  >
                    {wufuResult.grade}
                  </span>
                )}
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

/** 五服徽标：亲等越近边框越实，出服灰化弱化。只用描边不用底色，深浅两色模式都稳。 */
function wufuBadgeStyle(grade: WufuGrade): React.CSSProperties {
  const strength =
    grade === "斩衰"
      ? 100
      : grade === "齐衰"
        ? 80
        : grade === "大功"
          ? 60
          : grade === "小功"
            ? 45
            : grade === "缌麻"
              ? 30
              : 0;
  if (strength === 0) {
    return { borderColor: "var(--glass-edge)", color: "var(--ink-faint)" };
  }
  return {
    borderColor: `color-mix(in srgb, var(--accent) ${strength}%, transparent)`,
    color: "var(--ink-soft)",
  };
}
