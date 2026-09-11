"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
  Home,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
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
import {
  type FamilyState,
  type Gender,
  type Person,
  type RelationKind,
  addParentLink,
  addSpouseLink,
  areSpouses,
  createEmptyState,
  createPerson,
  exportState,
  getChildrenIds,
  getFatherId,
  getMotherId,
  getSiblingIds,
  getSpouseIds,
  groupByRelationDistance,
  importState,
  linkChildWithParents,
  loadState,
  removePersonDeep,
  removeSpouseLink,
  saveState,
} from "@/lib/family";
import {
  type ThemeMode,
  applyTheme,
  loadThemeMode,
  resolveTheme,
  saveThemeMode,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

type AddMode = RelationKind | null;

const THEME_META: Record<ThemeMode, { label: string; icon: typeof Sun }> = {
  light: { label: "浅色", icon: Sun },
  dark: { label: "深色", icon: Moon },
  system: { label: "跟随系统", icon: Monitor },
};

export function FamilyApp() {
  const [state, setState] = useState<FamilyState>(() => createEmptyState());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setFocusId(loaded.meId ?? firstPersonId(loaded));
    const mode = loadThemeMode();
    setThemeMode(mode);
    applyTheme(resolveTheme(mode));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState(state);
  }, [state, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const changeTheme = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
    applyTheme(resolveTheme(mode));
  }, []);

  const focus = focusId && state.persons[focusId] ? focusId : null;
  const meId = state.meId;

  const father = focus ? getFatherId(state, focus) : null;
  const mother = focus ? getMotherId(state, focus) : null;
  const spouses = focus ? getSpouseIds(state, focus) : [];
  const children = focus ? getChildrenIds(state, focus) : [];
  const siblings = focus ? getSiblingIds(state, focus) : [];

  const goParent = useCallback(() => {
    if (!focus) return;
    if (father) setFocusId(father);
    else if (mother) setFocusId(mother);
  }, [focus, father, mother]);

  const goMe = useCallback(() => {
    if (meId) setFocusId(meId);
  }, [meId]);

  const upsertPerson = useCallback((person: Person) => {
    setState((s) => ({
      ...s,
      persons: { ...s.persons, [person.id]: person },
    }));
  }, []);

  const setAsMe = useCallback((id: string) => {
    setState((s) => ({ ...s, meId: id }));
    setFocusId(id);
    setToast("已设为「我」");
  }, []);

  const deletePerson = useCallback((id: string) => {
    if (!window.confirm("确定删除此人及其关系？此操作不可撤销。")) return;
    setState((s) => removePersonDeep(s, id));
    setEditingId(null);
    setToast("已删除");
    setFocusId((prev) => (prev === id ? null : prev));
  }, []);

  const handleAddRelation = useCallback(
    (mode: RelationKind, draft: { name: string; gender: Gender }) => {
      if (!focus) return;
      const person = createPerson(draft);
      setState((s) => {
        let next: FamilyState = {
          ...s,
          persons: { ...s.persons, [person.id]: person },
        };
        if (mode === "father" || mode === "mother") {
          // `mode` 是用户显式选择的父/母，必须胜过任何按性别推导的角色。
          // 走 addParentLink（parents 的唯一构造者），不在这里裸写对象。
          next = addParentLink(next, focus, person.id, mode);
        } else if (mode === "spouse") {
          next = addSpouseLink(next, focus, person.id);
        } else if (mode === "child") {
          // 有配偶时自动挂上双亲
          next = linkChildWithParents(next, person.id, focus);
        }
        return next;
      });
      setAddMode(null);
      setToast("已添加");
    },
    [focus]
  );

  const handleLinkExistingAsChild = useCallback(
    (childId: string) => {
      if (!focus || childId === focus) return;
      setState((s) => linkChildWithParents(s, childId, focus));
      setAddMode(null);
      setToast("已关联为子女");
    },
    [focus]
  );

  const handleLinkExistingAsParent = useCallback(
    (parentId: string, role: "father" | "mother") => {
      if (!focus || parentId === focus) return;
      setState((s) => addParentLink(s, focus, parentId, role));
      setAddMode(null);
      setToast("已关联");
    },
    [focus]
  );

  const handleLinkExistingAsSpouse = useCallback(
    (otherId: string) => {
      if (!focus || otherId === focus) return;
      setState((s) => addSpouseLink(s, focus, otherId));
      setAddMode(null);
      setToast("已结为配偶");
    },
    [focus]
  );

  const removeSpouse = useCallback(
    (otherId: string) => {
      if (!focus) return;
      setState((s) => removeSpouseLink(s, focus, otherId));
      setToast("已解除配偶关系");
    },
    [focus]
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
    if (!window.confirm("导入将覆盖当前全部数据，确定继续？")) return;
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
  }, []);

  const resetAll = useCallback(() => {
    if (!window.confirm("确定清空全部数据？此操作不可撤销。")) return;
    setState(createEmptyState());
    setFocusId(null);
    setToast("已清空");
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
    <div className="flex min-h-dvh flex-col">
      {/* Header — 100% 宽度，通栏。
          只放三件事：品牌 / 查找 / 主题。数据操作一律下沉到 footer。 */}
      <header className="sticky top-0 z-40 w-full shrink-0 border-b border-[var(--glass-edge)] bg-[var(--bg-0)]/75 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0" data-header-item>
            <h1 className="text-display font-semibold tracking-tight text-[var(--ink)]">
              老太公
            </h1>
            <p className="truncate text-caption text-[var(--ink-faint)]">
              以「我」为中心的家族图谱
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              data-header-item
              onClick={() => setSearchOpen((v) => !v)}
              title="查找"
              aria-expanded={searchOpen}
            >
              {searchOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
            <ThemeCycleButton mode={themeMode} onChange={changeTheme} />
          </div>
        </div>
      </header>

      {/* SearchPanel 挂在 header 之外 —— 展开它不能改变 header 的元素数目 */}
      {searchOpen && (
        <SearchPanel
          state={state}
          onSelect={(id) => {
            setFocusId(id);
            setSearchOpen(false);
          }}
        />
      )}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 pt-5 sm:px-6 lg:max-w-5xl lg:px-8">

      {focus && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1 text-caption text-[var(--ink-soft)]">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={goMe}
              disabled={!meId || meId === focus}
              title="回到我"
            >
              <Home className="h-3.5 w-3.5" />
            </Button>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
            <span className="truncate font-medium text-[var(--ink)]">
              {state.persons[focus]?.name}
            </span>
            {meId === focus && (
              <span className="ml-1 shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-caption text-[var(--accent)]">
                我
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={goParent}
            disabled={!father && !mother}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            上一代
          </Button>
        </div>
      )}

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
      ) : !focus ? (
        <div className="glass-card flex flex-1 flex-col items-center justify-center rounded-3xl p-8 text-center">
          <p className="mb-4 text-body text-[var(--ink-soft)]">未指定「我」</p>
          <Button onClick={() => setFocusId(firstPersonId(state))}>
            选择一个人物
          </Button>
        </div>
      ) : (
        <TreeSection
          state={state}
          focusId={focus}
          meId={meId}
          father={father}
          mother={mother}
          spouses={spouses}
          children={children}
          siblings={siblings}
          onFocus={setFocusId}
          onEdit={setEditingId}
          onAdd={(mode) => setAddMode(mode)}
          onSetMe={setAsMe}
          onRemoveSpouse={removeSpouse}
        />
      )}

      </main>

      {/* Footer — 100% 宽度。数据输入输出与危险操作都在这里，header 保持干净。 */}
      <footer className="w-full shrink-0 border-t border-[var(--glass-edge)] bg-[var(--bg-0)]/60 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={exportJson}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">导出</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">导入</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={resetAll}>
              <Trash2 className="h-4 w-4 text-[var(--danger)]" />
              <span className="hidden sm:inline">清空</span>
            </Button>
          </div>
          <p className="text-caption text-[var(--ink-faint)]">
            {Object.keys(state.persons).length} 位成员 · 数据仅保存在本机
          </p>
        </div>
      </footer>

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
        open={!!editingId}
        person={editingId ? state.persons[editingId] : null}
        isMe={editingId === meId}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        onSave={upsertPerson}
        onDelete={deletePerson}
        onSetMe={setAsMe}
      />

      <AddRelationSheet
        open={!!addMode && !!focus}
        mode={addMode}
        focusPerson={focus ? state.persons[focus] : null}
        allPersons={state.persons}
        state={state}
        focusId={focus}
        onOpenChange={(open) => {
          if (!open) setAddMode(null);
        }}
        onCreate={handleAddRelation}
        onLinkChild={handleLinkExistingAsChild}
        onLinkParent={handleLinkExistingAsParent}
        onLinkSpouse={handleLinkExistingAsSpouse}
      />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div className="glass rounded-full px-4 py-2 text-body text-[var(--ink)] shadow-lg">
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
      data-header-item
      onClick={() => onChange(next)}
      title={`主题：${THEME_META[mode].label}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

/* ───────── Search Panel ───────── */

const SEARCH_FILTERS: Array<{ key: string; label: string }> = [
  { key: "male", label: "男" },
  { key: "female", label: "女" },
  { key: "alive", label: "在世" },
  { key: "dead", label: "已故" },
];

/**
 * 搜索与筛选合成一个面板（AC-8）。
 * 结果按「以我为原点」的关系距离分组；同辈一桶同时含配偶与兄弟姐妹（配偶权重为 0）。
 */
function SearchPanel({
  state,
  onSelect,
}: {
  state: FamilyState;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>([]);

  const groups = useMemo(() => groupByRelationDistance(state), [state]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (p: Person): boolean => {
      if (q) {
        const hay = [p.name, p.ancestralHome, p.household]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.length === 0) return true;
      return filters.some((f) => {
        if (f === "male") return p.gender === "male";
        if (f === "female") return p.gender === "female";
        if (f === "alive") return !p.deathYear;
        if (f === "dead") return !!p.deathYear;
        return true;
      });
    };
    return groups
      .map((g) => ({
        ...g,
        ids: g.ids.filter((id) => {
          const p = state.persons[id];
          return p ? match(p) : false;
        }),
      }))
      .filter((g) => g.ids.length > 0);
  }, [groups, query, filters, state.persons]);

  const total = visible.reduce((n, g) => n + g.ids.length, 0);

  const toggle = (key: string) =>
    setFilters((f) =>
      f.includes(key) ? f.filter((x) => x !== key) : [...f, key]
    );

  return (
    <div
      data-search-root
      className="w-full shrink-0 border-b border-[var(--glass-edge)] bg-[var(--bg-0)]/60 backdrop-blur-xl"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索姓名 / 籍贯 / 户籍"
            className="w-full bg-transparent text-body text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
          <span className="shrink-0 text-caption text-[var(--ink-faint)]">
            {total}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {SEARCH_FILTERS.map((f) => {
            const active = filters.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                data-filter-chip
                onClick={() => toggle(f.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-caption transition-colors",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border border-[var(--glass-border)] text-[var(--ink-soft)] hover:bg-[var(--glass-strong)]"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 max-h-[50dvh] overflow-y-auto">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-caption text-[var(--ink-faint)]">
              没有匹配的成员
            </p>
          ) : (
            visible.map((g) => (
              <section key={g.key} className="mb-3 last:mb-0">
                <h2 className="mb-1.5 text-caption font-medium text-[var(--ink-faint)]">
                  {g.label} · {g.ids.length}
                </h2>
                <ul className="space-y-1">
                  {g.ids.map((id) => {
                    const p = state.persons[id];
                    if (!p) return null;
                    const detail = [p.birthYear, p.ancestralHome]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onSelect(id)}
                          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--glass-strong)]"
                        >
                          <span className="truncate text-body text-[var(--ink)]">
                            {p.name}
                          </span>
                          {state.meId === id && (
                            <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-caption text-[var(--accent)]">
                              我
                            </span>
                          )}
                          {detail && (
                            <span className="ml-auto shrink-0 text-caption text-[var(--ink-faint)]">
                              {detail}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
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

      <div className="space-y-4">
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
        <Button
          className="w-full"
          size="lg"
          onClick={() => onStart(name.trim() || "我", gender)}
        >
          开始建立
        </Button>
      </div>
    </div>
  );
}

function GenderPicker({
  value,
  onChange,
}: {
  value: Gender;
  onChange: (g: Gender) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>性别</Label>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["male", "男"],
            ["female", "女"],
            ["unknown", "未知"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "h-10 rounded-2xl text-body transition-all",
              value === v
                ? "glass-btn text-[var(--ink)]"
                : "border border-[var(--glass-border)] text-[var(--ink-soft)] hover:bg-[var(--glass-strong)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────── Tree ───────── */

function TreeSection({
  state,
  focusId,
  meId,
  father,
  mother,
  spouses,
  children,
  siblings,
  onFocus,
  onEdit,
  onAdd,
  onSetMe,
  onRemoveSpouse,
}: {
  state: FamilyState;
  focusId: string;
  meId: string | null;
  father: string | null;
  mother: string | null;
  spouses: string[];
  children: string[];
  siblings: string[];
  onFocus: (id: string) => void;
  onEdit: (id: string) => void;
  onAdd: (mode: RelationKind) => void;
  onSetMe: (id: string) => void;
  onRemoveSpouse: (id: string) => void;
}) {
  const focus = state.persons[focusId];
  if (!focus) return null;

  return (
    <div className="flex flex-1 flex-col fade-node" key={focusId}>
      {/* Parents */}
      <section className="mb-1">
        <SectionLabel>父母</SectionLabel>
        <div className="mb-2 grid grid-cols-2 gap-3 sm:max-w-xl sm:mx-auto">
          <PersonCard
            person={father ? state.persons[father] : null}
            roleLabel="父亲"
            isMe={father === meId}
            onEmpty={() => onAdd("father")}
            onFocus={father ? () => onFocus(father) : undefined}
            onEdit={father ? () => onEdit(father) : undefined}
            onSetMe={father && father !== meId ? () => onSetMe(father) : undefined}
          />
          <PersonCard
            person={mother ? state.persons[mother] : null}
            roleLabel="母亲"
            isMe={mother === meId}
            onEmpty={() => onAdd("mother")}
            onFocus={mother ? () => onFocus(mother) : undefined}
            onEdit={mother ? () => onEdit(mother) : undefined}
            onSetMe={mother && mother !== meId ? () => onSetMe(mother) : undefined}
          />
        </div>
        <div className="mx-auto flex h-5 w-px connector" />
      </section>

      {/* Siblings (share parents with focus) */}
      {siblings.length > 0 && (
        <section className="mb-1">
          <SectionLabel>兄弟姐妹</SectionLabel>
          <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:max-w-3xl sm:mx-auto">
            {siblings.map((sid) => (
              <PersonCard
                key={sid}
                person={state.persons[sid]}
                isMe={sid === meId}
                onFocus={() => onFocus(sid)}
                onEdit={() => onEdit(sid)}
                onSetMe={sid !== meId ? () => onSetMe(sid) : undefined}
              />
            ))}
          </div>
          <div className="mx-auto flex h-5 w-px connector" />
        </section>
      )}

      {/* Focus + spouse */}
      <section className="relative mb-1">
        <div className="grid grid-cols-2 gap-3 sm:max-w-xl sm:mx-auto">
          <PersonCard
            person={focus}
            roleLabel={meId === focusId ? "我" : undefined}
            isMe={meId === focusId}
            highlighted
            onFocus={() => onFocus(focusId)}
            onEdit={() => onEdit(focusId)}
            onSetMe={meId !== focusId ? () => onSetMe(focusId) : undefined}
          />
          {spouses.length > 0 ? (
            <div className="flex flex-col gap-2">
              {spouses.map((sid) => (
                <div key={sid} className="relative">
                  <PersonCard
                    person={state.persons[sid]}
                    roleLabel="配偶"
                    isMe={sid === meId}
                    onFocus={() => onFocus(sid)}
                    onEdit={() => onEdit(sid)}
                    onSetMe={sid !== meId ? () => onSetMe(sid) : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveSpouse(sid)}
                    className="absolute -right-1 -top-1 z-10 rounded-full bg-black/40 p-1 text-white/70 backdrop-blur-md hover:text-red-300"
                    title="解除配偶"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <PersonCard
              person={null}
              roleLabel="配偶"
              onEmpty={() => onAdd("spouse")}
            />
          )}
        </div>
        <div className="mx-auto mt-0 flex h-5 w-px connector" />
      </section>

      {/* Children */}
      <section className="flex-1">
        <SectionLabel>子女</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {children.map((cid) => (
            <PersonCard
              key={cid}
              person={state.persons[cid]}
              isMe={cid === meId}
              onFocus={() => onFocus(cid)}
              onEdit={() => onEdit(cid)}
              onSetMe={cid !== meId ? () => onSetMe(cid) : undefined}
            />
          ))}
          <button
            type="button"
            onClick={() => onAdd("child")}
            className="empty-slot flex min-h-[128px] flex-col items-center justify-center gap-1.5 rounded-3xl"
          >
            <Plus className="h-5 w-5" />
            <span className="text-caption">添加子女</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-caption font-medium uppercase tracking-[0.14em] text-[var(--ink-faint)]">
        {children}
      </span>
      <div className="h-px flex-1 bg-[var(--glass-edge)]" />
    </div>
  );
}

/* ───────── Person Card ───────── */

/** 头像：有 photoUrl 时显示照片，加载失败或无链接时回退到「姓名首字 + 性别渐变」 */
function Avatar({
  person,
  size,
}: {
  person: Person;
  size: "lg" | "sm";
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!person.photoUrl && !photoFailed;

  return (
    <div
      className={cn(
        "avatar-ring relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl font-semibold text-white",
        size === "lg" ? "h-14 w-14 text-subtitle" : "h-9 w-9 text-caption",
        person.gender === "male" && "avatar-male",
        person.gender === "female" && "avatar-female",
        person.gender === "unknown" && "avatar-unknown"
      )}
    >
      {/* 首字始终在 DOM 里：照片加载失败时它就在下层，不会出现破图 */}
      <span aria-hidden={showPhoto}>{person.name.slice(0, 1)}</span>
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- 外置链接，不走 next/image
        <img
          src={person.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setPhotoFailed(true)}
        />
      )}
    </div>
  );
}

function PersonCard({
  person,
  roleLabel,
  isMe,
  highlighted,
  onEmpty,
  onFocus,
  onEdit,
  onSetMe,
}: {
  person: Person | null;
  roleLabel?: string;
  isMe?: boolean;
  highlighted?: boolean;
  onEmpty?: () => void;
  onFocus?: () => void;
  onEdit?: () => void;
  onSetMe?: () => void;
}) {
  if (!person) {
    return (
      <button
        type="button"
        onClick={onEmpty}
        className="empty-slot flex min-h-[104px] w-full flex-col items-center justify-center gap-2 rounded-3xl"
      >
        <Plus className="h-5 w-5" />
        <span className="text-caption">{roleLabel ? `添加${roleLabel}` : "添加"}</span>
      </button>
    );
  }

  // 锚点卡片（当前浏览的人）显示全部字段；亲属卡片只留姓名 + 生卒年 + 头像。
  // 高度差来自信息量，宽度两者都是 w-full —— 尺寸差是结果，不是手段。
  const anchor = !!highlighted;
  const years =
    person.birthYear || person.deathYear
      ? `${person.birthYear || "?"}–${person.deathYear || ""}`
      : "";
  const place =
    person.ancestralHome || person.household
      ? [
          person.ancestralHome && `籍 ${person.ancestralHome}`,
          person.household && `户 ${person.household}`,
        ]
          .filter(Boolean)
          .join("  ")
      : "";

  return (
    <div
      data-card={anchor ? "me" : "relative"}
      className={cn(
        "glass-card group relative w-full rounded-3xl transition-transform active:scale-[0.98]",
        anchor ? "p-card" : "p-3",
        anchor && "me",
        highlighted && "focused"
      )}
    >
      <button
        type="button"
        onClick={onFocus}
        className="block w-full text-left"
        aria-label={`查看 ${person.name} 的家庭`}
      >
        <div className={cn("flex items-start", anchor ? "gap-3.5" : "gap-2.5")}>
          <Avatar person={person} size={anchor ? "lg" : "sm"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <p
                className={cn(
                  "truncate font-semibold leading-tight text-[var(--ink)]",
                  anchor ? "text-subtitle" : "text-body"
                )}
              >
                {person.name}
              </p>
              {isMe && (
                <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-caption font-medium text-[var(--accent)]">
                  我
                </span>
              )}
              {roleLabel && roleLabel !== "我" && !isMe && (
                <span className="shrink-0 rounded-full bg-[var(--glass-strong)] px-1.5 py-0.5 text-caption text-[var(--ink-soft)]">
                  {roleLabel}
                </span>
              )}
            </div>
            {years && (
              <p
                className={cn(
                  "mt-0.5 text-caption",
                  anchor ? "text-[var(--ink-soft)]" : "text-[var(--ink-faint)]"
                )}
              >
                {years}
              </p>
            )}

            {/* 以下三块只属于锚点卡片 */}
            {anchor && place && (
              <p className="mt-1.5 truncate text-caption text-[var(--ink-soft)]">
                {place}
              </p>
            )}
            {anchor && person.note && (
              <p className="mt-1.5 line-clamp-2 text-caption leading-relaxed text-[var(--ink-faint)]">
                {person.note}
              </p>
            )}
            {anchor && (person.events?.length ?? 0) > 0 && (
              <p className="mt-1.5 text-caption text-[var(--ink-faint)]">
                {person.events?.length} 条家族事件
              </p>
            )}
          </div>
        </div>
      </button>

      <div className="mt-2.5 flex items-center justify-end gap-1 opacity-80">
        {onSetMe && (
          <Button variant="ghost" size="icon-sm" onClick={onSetMe} title="设为我">
            <Crown className="h-3.5 w-3.5" />
          </Button>
        )}
        {onEdit && (
          <Button variant="ghost" size="icon-sm" onClick={onEdit} title="编辑">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ───────── Edit Sheet ───────── */

function PersonEditSheet({
  open,
  person,
  isMe,
  onOpenChange,
  onSave,
  onDelete,
  onSetMe,
}: {
  open: boolean;
  person: Person | null;
  isMe: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (p: Person) => void;
  onDelete: (id: string) => void;
  onSetMe: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Person | null>(null);

  useEffect(() => {
    if (open && person) setDraft({ ...person });
  }, [open, person]);

  if (!draft) return null;

  const set = <K extends keyof Person>(k: K, v: Person[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="responsive">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            编辑人物
            {isMe && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-caption font-medium text-[var(--accent)]">
                我
              </span>
            )}
          </SheetTitle>
          <SheetDescription>完善姓名、生卒、籍贯与户籍信息</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">姓名</Label>
            <Input
              id="p-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={30}
            />
          </div>

          <GenderPicker
            value={draft.gender}
            onChange={(g) => set("gender", g)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-birth">出生年</Label>
              <Input
                id="p-birth"
                inputMode="numeric"
                placeholder="1980"
                value={draft.birthYear ?? ""}
                onChange={(e) => set("birthYear", e.target.value)}
                maxLength={12}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-death">逝世年</Label>
              <Input
                id="p-death"
                inputMode="numeric"
                placeholder="可空"
                value={draft.deathYear ?? ""}
                onChange={(e) => set("deathYear", e.target.value)}
                maxLength={12}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-home">籍贯</Label>
            <Input
              id="p-home"
              placeholder="祖籍 / 籍贯，如：福建泉州"
              value={draft.ancestralHome ?? ""}
              onChange={(e) => set("ancestralHome", e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-hh">户籍</Label>
            <Input
              id="p-hh"
              placeholder="户籍所在地，如：上海市浦东新区"
              value={draft.household ?? ""}
              onChange={(e) => set("household", e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-note">备注</Label>
            <Input
              id="p-note"
              placeholder="可选"
              value={draft.note ?? ""}
              onChange={(e) => set("note", e.target.value)}
              maxLength={100}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <div className="flex gap-2">
            {!isMe && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  onSetMe(draft.id);
                  onOpenChange(false);
                }}
              >
                <UserCheck className="h-4 w-4" />
                设为我
              </Button>
            )}
            <Button
              variant="danger"
              size="icon"
              onClick={() => onDelete(draft.id)}
              title="删除"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Button
            size="lg"
            onClick={() => {
              onSave({ ...draft, updatedAt: Date.now() });
              onOpenChange(false);
            }}
          >
            保存
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ───────── Add Relation Sheet ───────── */

function AddRelationSheet({
  open,
  mode,
  focusPerson,
  allPersons,
  state,
  focusId,
  onOpenChange,
  onCreate,
  onLinkChild,
  onLinkParent,
  onLinkSpouse,
}: {
  open: boolean;
  mode: AddMode;
  focusPerson: Person | null;
  allPersons: Record<string, Person>;
  state: FamilyState;
  focusId: string | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (mode: RelationKind, draft: { name: string; gender: Gender }) => void;
  onLinkChild: (childId: string) => void;
  onLinkParent: (parentId: string, role: "father" | "mother") => void;
  onLinkSpouse: (otherId: string) => void;
}) {
  const [tab, setTab] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("unknown");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setTab("new");
      setName("");
      setSearch("");
      setGender(
        mode === "father" ? "male" : mode === "mother" ? "female" : "unknown"
      );
    }
  }, [open, mode]);

  const title =
    mode === "father"
      ? "添加父亲"
      : mode === "mother"
        ? "添加母亲"
        : mode === "spouse"
          ? "添加配偶"
          : "添加子女";

  const candidates = useMemo(() => {
    if (!focusId || !mode) return [];
    return Object.values(allPersons)
      .filter((p) => p.id !== focusId)
      .filter((p) => {
        if (!search.trim()) return true;
        const q = search.trim();
        return (
          p.name.includes(q) ||
          (p.ancestralHome || "").includes(q) ||
          (p.household || "").includes(q)
        );
      })
      .filter((p) => {
        if (mode === "spouse") return !areSpouses(state, focusId, p.id);
        if (mode === "child") {
          const parents = state.parents[p.id];
          return (
            parents?.fatherId !== focusId && parents?.motherId !== focusId
          );
        }
        const existing = state.parents[focusId];
        if (mode === "father") return existing?.fatherId !== p.id;
        if (mode === "mother") return existing?.motherId !== p.id;
        return true;
      })
      .slice(0, 40);
  }, [allPersons, focusId, mode, search, state]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="responsive">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {focusPerson ? `为「${focusPerson.name}」建立关系` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--glass)] p-1">
          {(
            [
              ["new", "新建人物"],
              ["existing", "关联已有"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={cn(
                "rounded-xl py-2 text-body transition-all",
                tab === v
                  ? "glass-btn text-[var(--ink)]"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "new" ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="a-name">姓名</Label>
              <Input
                id="a-name"
                placeholder="输入姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
              />
            </div>
            <GenderPicker value={gender} onChange={setGender} />
            {mode === "child" && (
              <p className="text-caption text-[var(--ink-faint)]">
                若当前人物有配偶，将自动关联为双亲。
              </p>
            )}
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                if (!mode) return;
                onCreate(mode, { name: name.trim() || "未命名", gender });
              }}
            >
              <Plus className="h-4 w-4" />
              创建并关联
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-3 overflow-hidden">
            <Input
              placeholder="搜索姓名 / 籍贯 / 户籍"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
              {candidates.length === 0 ? (
                <p className="py-8 text-center text-body text-[var(--ink-faint)]">
                  暂无可关联人物
                </p>
              ) : (
                candidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (!mode) return;
                      if (mode === "child") onLinkChild(p.id);
                      else if (mode === "spouse") onLinkSpouse(p.id);
                      else onLinkParent(p.id, mode);
                    }}
                    className="glass flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:brightness-105"
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl text-body font-semibold text-white",
                        p.gender === "male" && "avatar-male",
                        p.gender === "female" && "avatar-female",
                        p.gender === "unknown" && "avatar-unknown"
                      )}
                    >
                      {p.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-[var(--ink)]">
                        {p.name}
                      </p>
                      <p className="truncate text-caption text-[var(--ink-soft)]">
                        {[
                          p.ancestralHome && `籍 ${p.ancestralHome}`,
                          p.household && `户 ${p.household}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
