"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Moon, Search, Settings2, Sun, Users } from "lucide-react";

import { AddRelationSheet } from "@/components/dialogs/add-relation-sheet";
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog";
import { PersonEditSheet } from "@/components/dialogs/person-edit-sheet";
import { SearchPanel } from "@/components/dialogs/search-panel";
import { SettingsSheet } from "@/components/dialogs/settings-sheet";
import { GenderPicker } from "@/components/gender-picker";
import { FamilyTree } from "@/components/family-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SheetBody } from "@/components/ui/sheet-body";
import { loadDevSample } from "@/lib/dev-sample";
import {
  DEFAULT_VIEW_PREFS,
  type ViewPrefs,
  LEGACY_LAYOUT_MODE_KEY,
  loadViewPrefs,
  saveViewPrefs,
} from "@/lib/view-prefs";
import {
  type AmbiguousLink,
  type FamilyState,
  type Gender,
  type Person,
  type RelationKind,
  RELATION_APPLIERS,
  addParentLink,
  addSpouseLink,
  applyRepairs,
  buildWufuMap,
  createEmptyState,
  createPerson,
  exportState,
  findRepairableLinks,
  getFatherId,
  getMotherId,
  getPartnerIds,
  groupByRelationDistance,
  importState,
  linkChildWithParents,
  loadState,
  relationBaseOf,
  relationOptions,
  removePersonDeep,
  saveState,
  spouseGenderConflictReason,
} from "@/lib/family";
import { buildKinshipMap } from "@/lib/kinship";
import {
  type ThemeMode,
  applyTheme,
  loadThemeMode,
  resolveTheme,
  saveThemeMode,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * 互斥弹窗只有一个在场：用可辨析联合代替六个独立的 boolean/id state，
 * 结构上保证不可能双开。ambiguous 横幅是提示性质，可以与任意弹窗同屏，
 * 因此保持独立。
 */
type ActiveDialog =
  | { kind: "none" }
  | { kind: "search" }
  | { kind: "settings" }
  | { kind: "edit"; personId: string }
  | { kind: "relation-picker"; personId: string }
  | { kind: "add-relation"; mode: RelationKind };

/** 确认弹窗的请求：确认动作以闭包形式给出，弹窗本身不碰数据 */
interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel: string;
  action: () => void;
}

const THEME_META: Record<ThemeMode, { label: string; icon: typeof Sun }> = {
  light: { label: "浅色", icon: Sun },
  dark: { label: "深色", icon: Moon },
  system: { label: "跟随系统", icon: Monitor },
};

/**
 * 应用标识：世系分支 —— 一位先祖，向四方延出后代。
 * 用 CSS 变量取色，因此浅色/深色主题下自动跟随。
 * （与 app/icon.svg 同构；那份是 favicon，不能用 var()，所以颜色写死。）
 *
 * 几何是为小尺寸调的：三条线加粗、端点加大、最外两条张开角度拉大，
 * 免得 16px 时四条线糊成一团。
 */
function AppMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="老太公"
      fill="none"
    >
      <defs>
        <linearGradient id="appmark-lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <g
        stroke="url(#appmark-lg)"
        strokeWidth="3.2"
        strokeLinecap="round"
        opacity="0.6"
      >
        <path d="M32 20 L13 45" />
        <path d="M32 20 L25.5 49" />
        <path d="M32 20 L38.5 49" />
        <path d="M32 20 L51 45" />
      </g>
      <circle cx="32" cy="15" r="7.5" fill="url(#appmark-lg)" />
      <g fill="url(#appmark-lg)" opacity="0.85">
        <circle cx="13" cy="47" r="5" />
        <circle cx="25.5" cy="51" r="5" />
        <circle cx="38.5" cy="51" r="5" />
        <circle cx="51" cy="47" r="5" />
      </g>
    </svg>
  );
}

export function FamilyApp() {
  const [state, setState] = useState<FamilyState>(() => createEmptyState());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>({ kind: "none" });
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** 有多位配偶候选、无法自动确定的缺失双亲；等用户逐条指定 */
  const [ambiguous, setAmbiguous] = useState<AmbiguousLink[]>([]);
  const [ambiguousOpen, setAmbiguousOpen] = useState(false);
  const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(DEFAULT_VIEW_PREFS);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const loaded = loadState();

    // 存量数据修复：写入路径的对称回填只作用于「新建」的关系，
    // 修复之前留下的单亲子女不会被追溯。这里在载入时补一次，
    // 且只补无歧义的（已绑定的那位家长恰好只有 1 位配偶）；
    // 有歧义的（≥ 2 位配偶）不猜，交给用户逐条指定。
    const { repairable, ambiguous: unresolved } = findRepairableLinks(loaded);
    const repaired = repairable.length > 0 ? applyRepairs(loaded, repairable) : loaded;

    setState(repaired);
    setFocusId(repaired.meId ?? firstPersonId(repaired));
    const mode = loadThemeMode();
    setThemeMode(mode);
    applyTheme(resolveTheme(mode));
    setViewPrefs(loadViewPrefs());
    // G6 渲染引擎已移除，顺手清掉废弃的持久化键
    try {
      window.localStorage.removeItem(LEGACY_LAYOUT_MODE_KEY);
    } catch {
      /* 存储不可用时忽略 */
    }
    setHydrated(true);

    if (repairable.length > 0) {
      setToast(`已修复 ${repairable.length} 处缺失的双亲关系`);
    }
    if (unresolved.length > 0) setAmbiguous(unresolved);

    // 开发模式且本机无数据时，自动载入 public/ 下的示例数据（见 lib/dev-sample.ts）
    loadDevSample().then((sample) => {
      if (!sample || cancelled) return;
      setState(sample);
      setFocusId(sample.meId ?? firstPersonId(sample));
      setToast("已载入开发示例数据");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // 连续写入只落最后一次盘（JSON.stringify 全量序列化不便宜）；
    // 关页/切后台时同步补写一次，防丢最后 250ms 内的变更
    const t = setTimeout(() => {
      if (!saveState(state)) {
        setToast("本机存储写入失败：配额可能已满，或被浏览器限制");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state, hydrated]);

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (!hydrated) return;
    const flush = () => {
      saveState(stateRef.current);
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // 全图派生层：一次 state 变更只算一遍，五服/称谓/距离分组多处共用。
  // 这些都是 O(V²) 级的重计算，曾分散在画布/编辑面板/查找面板里各自推导。
  const graph = useMemo(
    () => ({
      wufu: buildWufuMap(state),
      kinship: buildKinshipMap(state, state.meId),
      distanceGroups: groupByRelationDistance(state),
    }),
    [state]
  );

  const changeShowMinimap = useCallback((show: boolean) => {
    setViewPrefs((p) => ({ ...p, showMinimap: show }));
    saveViewPrefs({ showMinimap: show });
  }, []);

  const changeTheme = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
    applyTheme(resolveTheme(mode));
  }, []);

  const closeDialog = useCallback(() => setActiveDialog({ kind: "none" }), []);

  const focus = focusId && state.persons[focusId] ? focusId : null;
  const meId = state.meId;

  const upsertPerson = useCallback((person: Person) => {
    setState((s) => ({
      ...s,
      persons: { ...s.persons, [person.id]: person },
    }));
  }, []);

  // FamilyTree 已 memo：这两个回调必须稳定，弹窗/toast 状态变化才不会
  // 穿透重渲染整棵画布
  const handleOpenPerson = useCallback((id: string) => {
    setActiveDialog({ kind: "edit", personId: id });
  }, []);
  const handleAddRelationRequest = useCallback((id: string) => {
    setActiveDialog({ kind: "relation-picker", personId: id });
  }, []);

  const setAsMe = useCallback((id: string) => {
    setState((s) => ({ ...s, meId: id }));
    setFocusId(id);
    setToast("已设为「我」");
  }, []);

  const deletePerson = useCallback((id: string) => {
    setConfirmRequest({
      title: "删除此人？",
      description: "将同时解除此人全部亲属关系，此操作不可撤销。",
      confirmLabel: "删除",
      action: () => {
        setState((s) => removePersonDeep(s, id));
        setActiveDialog({ kind: "none" });
        setToast("已删除");
        setFocusId((prev) => (prev === id ? null : prev));
      },
    });
  }, []);

  const handleAddRelation = useCallback(
    (mode: RelationKind, draft: { name: string; gender: Gender }) => {
      if (!focus) return;
      // 兜底校验：选择面板已按性别过滤，但表单里的性别可改，这里再挡一道
      if (relationBaseOf(mode) === "spouse") {
        const conflict = spouseGenderConflictReason(
          state.persons[focus]?.gender ?? "unknown",
          draft.gender
        );
        if (conflict) {
          setToast(conflict);
          return;
        }
      }
      const person = createPerson(draft);
      setState((s) =>
        RELATION_APPLIERS[relationBaseOf(mode)](
          { ...s, persons: { ...s.persons, [person.id]: person } },
          focus,
          person.id
        )
      );
      setActiveDialog({ kind: "none" });
      setToast("已添加");
    },
    [focus, state.persons]
  );

  const handleLinkExistingAsChild = useCallback(
    (childId: string) => {
      if (!focus || childId === focus) return;
      setState((s) => linkChildWithParents(s, childId, focus));
      setActiveDialog({ kind: "none" });
      setToast("已关联为子女");
    },
    [focus]
  );

  const handleLinkExistingAsParent = useCallback(
    (parentId: string, role: "father" | "mother") => {
      if (!focus || parentId === focus) return;
      setState((s) => addParentLink(s, focus, parentId, role));
      setActiveDialog({ kind: "none" });
      setToast("已关联");
    },
    [focus]
  );

  const handleLinkExistingAsSpouse = useCallback(
    (otherId: string) => {
      if (!focus || otherId === focus) return;
      const conflict = spouseGenderConflictReason(
        state.persons[focus]?.gender ?? "unknown",
        state.persons[otherId]?.gender ?? "unknown"
      );
      if (conflict) {
        setToast(conflict);
        return;
      }
      setState((s) => addSpouseLink(s, focus, otherId));
      setActiveDialog({ kind: "none" });
      setToast("已结为配偶");
    },
    [focus, state.persons]
  );

  const exportJson = useCallback(() => {
    const blob = new Blob([exportState(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laotagong-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("已导出");
  }, [state]);

  const importJson = useCallback((file: File) => {
    setConfirmRequest({
      title: "导入并覆盖当前数据？",
      description: "导入的 JSON 将覆盖本机全部数据，建议先导出备份。",
      confirmLabel: "导入",
      action: () => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const next = importState(String(reader.result));
            setState(next);
            setFocusId(next.meId ?? firstPersonId(next));
            setToast("导入成功");
          } catch {
            setToast("导入失败：格式不正确");
          }
        };
        reader.readAsText(file);
      },
    });
  }, []);

  const resetAll = useCallback(() => {
    setConfirmRequest({
      title: "清空全部数据？",
      description: "所有成员与关系都会被删除，此操作不可撤销。",
      confirmLabel: "清空",
      action: () => {
        setState(createEmptyState());
        setFocusId(null);
        setToast("已清空");
      },
    });
  }, []);

  /** 确认弹窗：动作只跑一次（updater 必须是纯函数，副作用放在外面） */
  const handleConfirm = useCallback(() => {
    confirmRequest?.action();
    setConfirmRequest(null);
  }, [confirmRequest]);
  const cancelConfirm = useCallback(() => setConfirmRequest(null), []);

  /** 设置弹窗里的「重载示例数据」：无视现有数据，直接用 public/ 下的示例覆盖（仅开发模式可见） */
  const reloadDevSample = useCallback(async () => {
    const sample = await loadDevSample(true);
    if (sample) {
      setState(sample);
      setFocusId(sample.meId ?? firstPersonId(sample));
      setActiveDialog({ kind: "none" });
      setToast("已重载示例数据");
    } else {
      setToast("示例数据不可用");
    }
  }, []);

  /**
   * 用户为某个子女显式指定了缺失的那一端双亲。
   *
   * 收 item 而非 index：索引会在列表变动时漂移，而引用不会。
   * 副作用放在 updater **外面**——updater 必须是纯函数，
   * 否则 StrictMode 下跑两次就可能写两遍。
   */
  const resolveAmbiguous = useCallback(
    (item: AmbiguousLink, spouseId: string) => {
      setState((s) => addParentLink(s, item.childId, spouseId, item.role));
      setAmbiguous((list) => list.filter((x) => x !== item));
      setToast("已指定");
    },
    []
  );

  /** 用户选择「暂不指定」——只是不再提示，不写任何数据 */
  const dismissAmbiguous = useCallback((item: AmbiguousLink) => {
    setAmbiguous((list) => list.filter((x) => x !== item));
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="glass-card rounded-3xl px-8 py-6 text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-[var(--glass-edge)] border-t-[var(--accent)]" />
          <p className="text-body text-[var(--ink-soft)]">载入中…</p>
        </div>
      </div>
    );
  }

  const isEmpty = Object.keys(state.persons).length === 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Header — 100% 宽度，通栏。品牌 / 查找 / 数据 / 主题，各占一个图标。 */}
      <header className="safe-top sticky top-0 z-40 w-full shrink-0 border-b border-[var(--glass-edge)] bg-[var(--bg-0)]/75 pb-3 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5" data-header-item>
            <AppMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
            <h1 className="truncate text-display font-semibold tracking-tight text-[var(--ink)]">
              老太公
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="hit-40"
              data-header-item
              onClick={() => setActiveDialog({ kind: "search" })}
              title="查找"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hit-40"
              data-header-item
              onClick={() => setActiveDialog({ kind: "settings" })}
              title="设置"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <ThemeCycleButton mode={themeMode} onChange={changeTheme} />
          </div>
        </div>
      </header>

      {/* 有多位配偶候选、无法自动确定缺失双亲时提示。不写数据，等用户逐条指定。 */}
      {ambiguous.length > 0 && (
        <div className="w-full shrink-0 border-b border-[var(--glass-edge)] bg-[var(--accent-soft)]">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
            <p className="text-caption text-[var(--ink-soft)]">
              发现 {ambiguous.length} 处缺失的双亲无法自动确定（该家长有多位配偶）
            </p>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setAmbiguousOpen(true)}
            >
              逐条指定
            </Button>
          </div>
        </div>
      )}

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 pb-3 pt-3 sm:px-5 lg:px-6">
        {isEmpty ? (
          <EmptyState
            onStart={(name, gender) => {
              const person = createPerson({ name, gender });
              setState((s) => ({
                ...s,
                persons: { ...s.persons, [person.id]: person },
                meId: person.id,
              }));
              setFocusId(person.id);
              setToast("已创建「我」");
            }}
          />
        ) : (
          <FamilyTree
            state={state}
            focusId={focus}
            showMinimap={viewPrefs.showMinimap}
            kinship={graph.kinship}
            wufu={graph.wufu}
            onOpenPerson={handleOpenPerson}
            onAddRelation={handleAddRelationRequest}
            onSetMe={setAsMe}
          />
        )}
      </main>

      {/* Footer — 100% 宽度。数据输入输出与危险操作都在这里，header 保持干净。 */}
      <footer className="w-full shrink-0 border-t border-[var(--glass-edge)] bg-[var(--bg-0)]/60 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 text-center sm:px-6 lg:px-8">
          <p className="text-caption text-[var(--ink-faint)]">© 2026 Laiha 版权所有</p>
        </div>
      </footer>

      {/* 查找弹窗 */}
      <Sheet
        open={activeDialog.kind === "search"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <SheetContent side="responsive">
          <SheetHeader>
            <SheetTitle>查找</SheetTitle>
            <SheetDescription>搜索姓名、籍贯或户籍，或按条件筛选</SheetDescription>
          </SheetHeader>
          <SearchPanel
            state={state}
            groups={graph.distanceGroups}
            onSelect={(id) => {
              setFocusId(id);
              closeDialog();
            }}
          />
        </SheetContent>
      </Sheet>

      <SettingsSheet
        open={activeDialog.kind === "settings"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        viewPrefs={viewPrefs}
        onChangeShowMinimap={changeShowMinimap}
        onExport={exportJson}
        onImport={() => fileRef.current?.click()}
        onReset={resetAll}
        memberCount={Object.keys(state.persons).length}
        onReloadDevSample={
          process.env.NODE_ENV === "development" ? reloadDevSample : undefined
        }
      />

      {/* 增加关系：节点上放不下四个按钮，先选种类 */}
      <Sheet
        open={activeDialog.kind === "relation-picker"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <SheetContent side="responsive">
          <SheetHeader>
            <SheetTitle>增加关系</SheetTitle>
            <SheetDescription>
              为「
              {activeDialog.kind === "relation-picker"
                ? state.persons[activeDialog.personId]?.name ?? "此人"
                : "此人"}
              」添加亲属，或关联已有成员
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 pb-2">
            {relationOptions(
              activeDialog.kind === "relation-picker"
                ? state.persons[activeDialog.personId]?.gender ?? "unknown"
                : "unknown",
              activeDialog.kind === "relation-picker"
                ? {
                    hasFather: !!getFatherId(state, activeDialog.personId),
                    hasMother: !!getMotherId(state, activeDialog.personId),
                    hasPartner:
                      getPartnerIds(state, activeDialog.personId).length > 0,
                  }
                : {}
            ).map((opt) => (
              <Button
                key={opt.kind}
                variant="outline"
                className="h-12"
                disabled={!!opt.disabledReason}
                title={opt.disabledReason ?? undefined}
                onClick={() => {
                  // 添加关系的表单围绕 focus 展开，先把焦点挪过去
                  if (activeDialog.kind === "relation-picker") {
                    setFocusId(activeDialog.personId);
                  }
                  setActiveDialog({ kind: "add-relation", mode: opt.kind });
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* 有多位候选的缺失双亲，逐条指定 */}
      <Sheet open={ambiguousOpen} onOpenChange={setAmbiguousOpen}>
        <SheetContent side="responsive">
          <SheetHeader>
            <SheetTitle>指定缺失的双亲</SheetTitle>
            <SheetDescription>
              以下子女缺一端双亲，而该家长有多位配偶，无法自动确定
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-2.5">
            {ambiguous.length === 0 ? (
              <p className="py-6 text-center text-caption text-[var(--ink-faint)]">
                没有待指定的关系
              </p>
            ) : (
              ambiguous.map((item) => (
                <div
                  key={`${item.childId}-${item.role}`}
                  className="rounded-2xl border border-[var(--glass-border)] p-3"
                >
                  <p className="text-body text-[var(--ink)]">
                    {state.persons[item.childId]?.name ?? item.childId}
                    <span className="ml-2 text-caption text-[var(--ink-faint)]">
                      缺{item.role === "father" ? "父" : "母"}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.candidates.map((candidateId) => (
                      <Button
                        key={candidateId}
                        variant="outline"
                        size="sm"
                        onClick={() => resolveAmbiguous(item, candidateId)}
                      >
                        {state.persons[candidateId]?.name ?? candidateId}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismissAmbiguous(item)}
                    >
                      暂不指定
                    </Button>
                  </div>
                </div>
              ))
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = "";
        }}
      />

      <PersonEditSheet
        open={activeDialog.kind === "edit"}
        person={
          activeDialog.kind === "edit"
            ? state.persons[activeDialog.personId] ?? null
            : null
        }
        state={state}
        isMe={activeDialog.kind === "edit" && activeDialog.personId === meId}
        isFocus={activeDialog.kind === "edit" && activeDialog.personId === focus}
        wufu={
          activeDialog.kind === "edit"
            ? graph.wufu.get(activeDialog.personId) ?? null
            : null
        }
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onSave={upsertPerson}
        onDelete={deletePerson}
        onSetMe={setAsMe}
        onRecenter={(id) => {
          setFocusId(id);
          closeDialog();
        }}
        onAddRelation={(mode) => {
          // 添加关系的表单是围绕 focus 展开的，所以先把焦点挪过去
          if (activeDialog.kind === "edit") setFocusId(activeDialog.personId);
          setActiveDialog({ kind: "add-relation", mode });
        }}
      />

      <AddRelationSheet
        open={activeDialog.kind === "add-relation" && !!focus}
        mode={activeDialog.kind === "add-relation" ? activeDialog.mode : null}
        focusPerson={focus ? state.persons[focus] : null}
        allPersons={state.persons}
        state={state}
        focusId={focus}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onCreate={handleAddRelation}
        onLinkChild={handleLinkExistingAsChild}
        onLinkParent={handleLinkExistingAsParent}
        onLinkSpouse={handleLinkExistingAsSpouse}
      />

      <ConfirmDialog
        open={!!confirmRequest}
        title={confirmRequest?.title ?? ""}
        description={confirmRequest?.description}
        confirmLabel={confirmRequest?.confirmLabel}
        danger
        onConfirm={handleConfirm}
        onCancel={cancelConfirm}
      />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div
            role="status"
            aria-live="polite"
            className="glass rounded-full px-4 py-2 text-body text-[var(--ink)] shadow-lg"
          >
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeCycleButton({
  mode,
  onChange,
}: {
  mode: ThemeMode;
  onChange: (m: ThemeMode) => void;
}) {
  const order: ThemeMode[] = ["light", "dark", "system"];
  const next = order[(order.indexOf(mode) + 1) % order.length];
  const Icon = THEME_META[mode].icon;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="hit-40"
      data-header-item
      onClick={() => onChange(next)}
      title={`主题：${THEME_META[mode].label}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function firstPersonId(state: FamilyState): string | null {
  const ids = Object.keys(state.persons);
  if (!ids.length) return null;
  if (state.meId && state.persons[state.meId]) return state.meId;
  return ids[0];
}

/* ───────── Empty State ───────── */

function EmptyState({
  onStart,
}: {
  onStart: (name: string, gender: Gender) => void;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("male");

  return (
    <div className="glass-card mx-auto flex w-full max-w-md flex-1 flex-col justify-center rounded-[28px] p-7 fade-node">
      <div className="mb-6 text-center">
        <div className="glass mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl">
          <Users className="h-7 w-7 text-[var(--accent)]" />
        </div>
        <h2 className="text-title font-semibold text-[var(--ink)]">
          建立你的家族图谱
        </h2>
        <p className="mt-1.5 text-body leading-relaxed text-[var(--ink-soft)]">
          先从「我」开始，再向上添加父母，
          <br />
          向下延伸子女，横向连接配偶。
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(name.trim() || "我", gender);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="me-name">你的名字</Label>
          <Input
            id="me-name"
            placeholder="例如：张三"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
          />
        </div>
        <GenderPicker value={gender} onChange={setGender} />
        <Button className="w-full" size="lg" type="submit">
          开始建立
        </Button>
      </form>
    </div>
  );
}
