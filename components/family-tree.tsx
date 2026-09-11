"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Crown, Info, Maximize2, Minus, Plus, Target, UserPlus } from "lucide-react";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import {
  type FamilyState,
  type Person,
  lifespanOf,
  zodiacOf,
} from "@/lib/family";
import { type TreeLayout, layoutFamilyTree } from "@/lib/tree";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.15;

interface View {
  x: number;
  y: number;
  scale: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * 家族树画布：可缩放、可拖拽，坐标原点在内容左上角。
 *
 * 用 CSS transform 而不是 canvas 绘制：节点是真 DOM，
 * 于是头像、文字换行、点击、无障碍全部免费，缩放也不会糊。
 */
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
  const layout = useMemo(() => layoutFamilyTree(state), [state]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });

  /** 把某个人移到视口正中 */
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

  /** 缩放到整棵树刚好铺满视口 */
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

  // 首次挂载：以「我」为中心
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || layout.byId.size === 0) return;
    didInit.current = true;
    centerOn(state.meId ?? focusId, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  /** 以某个屏幕点为中心缩放，手感才对 */
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

  // wheel 必须用非 passive 的原生监听，否则 preventDefault 无效、页面会跟着滚
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

  // 拖拽平移 + 双指缩放
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panOrigin = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pinchOrigin = useRef<{ distance: number; scale: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // pointerId 已失效时浏览器会抛 NotFoundError；捕获失败不该把页面带崩
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
      const ratio = distance / pinchOrigin.current.distance;
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
      setView((v) => ({
        ...v,
        x: panOrigin.current!.vx + (event.clientX - panOrigin.current!.x),
        y: panOrigin.current!.vy + (event.clientY - panOrigin.current!.y),
      }));
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchOrigin.current = null;
    if (pointers.current.size === 0) panOrigin.current = null;
  };

  if (layout.nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-body text-[var(--ink-faint)]">还没有成员</p>
      </div>
    );
  }

  return (
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
            onOpenPerson={onOpenPerson}
            onAddRelation={onAddRelation}
            onSetMe={onSetMe}
          />
        </div>
      </div>

      {/* 控制条 */}
      <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col gap-1.5">
        <Button
          variant="glass"
          size="icon-sm"
          className="pointer-events-auto"
          onClick={() => zoomAt(
            (containerRef.current?.getBoundingClientRect().left ?? 0) +
              (containerRef.current?.clientWidth ?? 0) / 2,
            (containerRef.current?.getBoundingClientRect().top ?? 0) +
              (containerRef.current?.clientHeight ?? 0) / 2,
            ZOOM_STEP
          )}
          title="放大"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="glass"
          size="icon-sm"
          className="pointer-events-auto"
          onClick={() => zoomAt(
            (containerRef.current?.getBoundingClientRect().left ?? 0) +
              (containerRef.current?.clientWidth ?? 0) / 2,
            (containerRef.current?.getBoundingClientRect().top ?? 0) +
              (containerRef.current?.clientHeight ?? 0) / 2,
            1 / ZOOM_STEP
          )}
          title="缩小"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="glass"
          size="icon-sm"
          className="pointer-events-auto"
          onClick={fitAll}
          title="看全族"
        >
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
  );
}


/**
 * 画布「场景」：连线 + 所有节点。
 *
 * 单独抽出来并 memo：平移/缩放只改外层 div 的 transform，
 * 场景的 props 不变就整块跳过协调。否则每一次 pointermove 都要重渲染
 * 全部节点（每个节点含头像与三个按钮），人一多就把主线程堵死。
 */
const TreeScene = memo(function TreeScene({
  layout,
  persons,
  meId,
  focusId,
  onOpenPerson,
  onAddRelation,
  onSetMe,
}: {
  layout: TreeLayout;
  persons: Record<string, Person>;
  meId: string | null;
  focusId: string | null;
  onOpenPerson: (id: string) => void;
  onAddRelation: (id: string) => void;
  onSetMe: (id: string) => void;
}) {
  return (
    <>
      {/* 连线画在节点下层 */}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={layout.width}
            height={layout.height}
            aria-hidden
          >
            {layout.edges.map((edge) => {
              const from = layout.byId.get(edge.fromId);
              const to = layout.byId.get(edge.toId);
              if (!from || !to) return null;
              const fx = from.x + from.width / 2;
              const fy = from.y + from.height;
              const tx = to.x + to.width / 2;
              const ty = to.y;

              if (edge.kind === "spouse") {
                // 夫妻：两点之间一条短横线，同高
                return (
                  <line
                    key={`s-${edge.fromId}-${edge.toId}`}
                    x1={from.x + from.width}
                    y1={from.y + from.height / 2}
                    x2={to.x}
                    y2={to.y + to.height / 2}
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeOpacity={0.45}
                  />
                );
              }

              // 血亲：竖-横-竖的折线，比斜线更像族谱
              const midY = fy + (ty - fy) / 2;
              return (
                <path
                  key={`b-${edge.fromId}-${edge.toId}`}
                  d={`M ${fx} ${fy} V ${midY} H ${tx} V ${ty}`}
                  fill="none"
                  stroke="var(--glass-edge)"
                  strokeWidth={2}
                />
              );
            })}
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

            return (
              <div
                key={node.id}
                data-tree-node
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                }}
                className={cn(
                  "glass-card absolute flex items-stretch overflow-hidden rounded-2xl",
                  isMe && "me",
                  isFocus && "focused"
                )}
              >
                {/* 主体：看详情 */}
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
                </button>

                {/* 三个动作竖排在卡片右侧：增加关系 / 详情 / 设为「我」
                    必须 onPointerDown 阻止冒泡，否则会顺手把画布拖起来 */}
                <div
                  className="flex shrink-0 flex-col items-center justify-center gap-0.5 border-l border-[var(--glass-edge)] px-0.5"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onAddRelation(node.id)}
                    title="增加关系"
                    className="rounded-lg p-1 text-[var(--ink-soft)] transition-colors hover:bg-[var(--glass-strong)] hover:text-[var(--ink)]"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPerson(node.id)}
                    title="详情"
                    className="rounded-lg p-1 text-[var(--ink-soft)] transition-colors hover:bg-[var(--glass-strong)] hover:text-[var(--ink)]"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetMe(node.id)}
                    disabled={isMe}
                    title="设为「我」"
                    className="rounded-lg p-1 text-[var(--ink-soft)] transition-colors hover:bg-[var(--glass-strong)] hover:text-[var(--accent)] disabled:opacity-30"
                  >
                    <Crown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
    </>
  );
});
