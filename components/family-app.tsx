"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Database,
  Download,
  Heart,
  Home,
  Monitor,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { FamilyTree } from "@/components/family-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type AmbiguousLink,
  type EventType,
  type FamilyEvent,
  type FamilyState,
  type Gender,
  type Person,
  type RelationKind,
  type WufuResult,
  EVENT_TYPES,
  applyRepairs,
  findRepairableLinks,
  wufuOf,
  zodiacOf,
  addParentLink,
  addSpouseLink,
  areSpouses,
  createEmptyState,
  createPerson,
  exportState,
  getFatherId,
  getMotherId,
  getPartnerIds,
  groupByRelationDistance,
  lifespanOf,
  importState,
  linkChildWithParents,
  loadState,
  removePersonDeep,
  saveState,
} from "@/lib/family";
import {
  type ThemeMode,
  applyTheme,
  loadThemeMode,
  resolveTheme,
  saveThemeMode,
} from "@/lib/theme";
import {
  PROVINCES,
  countySuggestionsOf,
  joinAddress,
  splitAddress,
} from "@/lib/regions";
import { cn } from "@/lib/utils";

type AddMode = RelationKind | null;

const THEME_META: Record<ThemeMode, { label: string; icon: typeof Sun }> = {
  light: { label: "浅色", icon: Sun },
  dark: { label: "深色", icon: Moon },
  system: { label: "跟随系统", icon: Monitor },
};


/**
 * 新建一个关系：把「关系种类 + 焦点 + 新人物」映射成一个**纯函数**
 * `FamilyState -> FamilyState`。
 *
 * 用查表取代 if/else 链：每个关系类型就是一个可单独测试、可单独替换的纯函数，
 * 也不用在分支里手写不可变更新。`father` / `mother` 显式传 mode，
 * 因为那是用户的选择，不该由性别推导覆盖。
 */
const RELATION_APPLIERS: Record<
  RelationKind,
  (state: FamilyState, focusId: string, personId: string) => FamilyState
> = {
  father: (state, focusId, personId) =>
    addParentLink(state, focusId, personId, "father"),
  mother: (state, focusId, personId) =>
    addParentLink(state, focusId, personId, "mother"),
  spouse: (state, focusId, personId) =>
    addSpouseLink(state, focusId, personId),
  child: (state, focusId, personId) =>
    linkChildWithParents(state, personId, focusId),
};

/** 出生/逝世年份的下拉范围：今年往前到 1900 */
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS: string[] = Array.from(
  { length: CURRENT_YEAR - 1900 + 1 },
  (_, i) => String(CURRENT_YEAR - i)
);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1));

/** 省下拉 + 市/县可搜可选。地址仍只存一条字符串，拆合都在这里。 */
function AddressField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { province, county } = splitAddress(value);
  const suggestions = countySuggestionsOf(province);
  const listId = `${id}-counties`;

  return (
    <div className="space-y-1">
      <Label htmlFor={`${id}-county`}>{label}</Label>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
        <Select
          aria-label={`${label}省份`}
          value={province}
          onChange={(e) => onChange(joinAddress(e.target.value, county))}
        >
          <option value="">省…</option>
          {PROVINCES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <Input
          id={`${id}-county`}
          list={suggestions.length > 0 ? listId : undefined}
          placeholder="三门县"
          value={county}
          onChange={(e) => onChange(joinAddress(province, e.target.value))}
          maxLength={40}
        />
      </div>
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** 年 / 月 / 日 三个下拉。月日可留空——很多长辈本来就只知年份。 */
function DateField({
  label,
  year,
  month,
  day,
  onChange,
}: {
  label: string;
  year: string;
  month: string;
  day: string;
  onChange: (part: "year" | "month" | "day", value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-2">
        <Select
          aria-label={`${label}年份`}
          value={year}
          onChange={(e) => onChange("year", e.target.value)}
        >
          <option value="">不详</option>
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Select
          aria-label={`${label}月份`}
          value={month}
          onChange={(e) => onChange("month", e.target.value)}
        >
          <option value="">月</option>
          {MONTH_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          aria-label={`${label}日期`}
          value={day}
          onChange={(e) => onChange("day", e.target.value)}
        >
          <option value="">日</option>
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  /** 有多位配偶候选、无法自动确定的缺失双亲；等用户逐条指定 */
  const [ambiguous, setAmbiguous] = useState<AmbiguousLink[]>([]);
  const [ambiguousOpen, setAmbiguousOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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
    setHydrated(true);

    if (repairable.length > 0) {
      setToast(`已修复 ${repairable.length} 处缺失的双亲关系`);
    }
    if (unresolved.length > 0) setAmbiguous(unresolved);
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
      setState((s) =>
        RELATION_APPLIERS[mode](
          { ...s, persons: { ...s.persons, [person.id]: person } },
          focus,
          person.id
        )
      );
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
      <header className="sticky top-0 z-40 w-full shrink-0 border-b border-[var(--glass-edge)] bg-[var(--bg-0)]/75 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
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
              data-header-item
              onClick={() => setSearchOpen(true)}
              title="查找"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-header-item
              onClick={() => setDataOpen(true)}
              title="数据管理"
            >
              <Database className="h-4 w-4" />
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
            onOpenPerson={(id) => setEditingId(id)}
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
      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent side="responsive">
          <SheetHeader>
            <SheetTitle>查找</SheetTitle>
            <SheetDescription>搜索姓名、籍贯或户籍，或按条件筛选</SheetDescription>
          </SheetHeader>
          <SearchPanel
            state={state}
            onSelect={(id) => {
              setFocusId(id);
              setSearchOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>

      {/* 数据管理弹窗 */}
      <Sheet open={dataOpen} onOpenChange={setDataOpen}>
        <SheetContent side="responsive">
          <SheetHeader>
            <SheetTitle>数据管理</SheetTitle>
            <SheetDescription>导出备份、导入恢复，或清空全部数据</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={exportJson}
            >
              <Download className="h-4 w-4" />
              导出 JSON
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              导入 JSON
            </Button>
            <Button
              variant="danger"
              className="w-full justify-start"
              onClick={resetAll}
            >
              <Trash2 className="h-4 w-4" />
              清空数据
            </Button>
            <p className="pt-2 text-caption text-[var(--ink-faint)]">
              共 {Object.keys(state.persons).length} 位成员 · 数据仅保存在本机浏览器
            </p>
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
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-1">
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
          </div>
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
        open={!!editingId}
        person={editingId ? state.persons[editingId] : null}
        state={state}
        isMe={editingId === meId}
        isFocus={editingId === focus}
        wufu={editingId ? wufuOf(state, editingId) : null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        onSave={upsertPerson}
        onDelete={deletePerson}
        onSetMe={setAsMe}
        onRecenter={(id) => {
          setFocusId(id);
          setEditingId(null);
        }}
        onAddRelation={(mode) => {
          // 添加关系的表单是围绕 focus 展开的，所以先把焦点挪过去
          if (editingId) setFocusId(editingId);
          setEditingId(null);
          setAddMode(mode);
        }}
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

        <div className="mt-3 max-h-[50dvh] overflow-y-auto px-1 -mx-1">
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

/* ───────── Family Events ───────── */

const EVENT_LABELS: Record<EventType, string> = {
  marriage: "婚嫁",
  migration: "迁徙",
  birth: "出生",
  death: "离世",
  education: "褒学",
  custom: "其他",
};

/**
 * 生平事件编辑器。默认折叠——事件只在编辑面板里出现，
 * 不放到卡片正面，否则锚点卡片会被塞爆（AC-31）。
 */
function FamilyEventList({
  events,
  onChange,
}: {
  events: FamilyEvent[];
  onChange: (next: FamilyEvent[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const update = (id: string, patch: Partial<FamilyEvent>) =>
    onChange(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const add = () =>
    onChange([
      ...events,
      {
        id: crypto.randomUUID(),
        type: "custom",
        date: "",
        place: "",
        note: "",
      },
    ]);

  const remove = (id: string) => onChange(events.filter((e) => e.id !== id));

  return (
    <div className="space-y-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-body font-medium text-[var(--ink)]">家族事件</span>
        <span className="flex items-center gap-2 text-caption text-[var(--ink-faint)]">
          {events.length > 0 && <span>{events.length} 条</span>}
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          {events.length === 0 && (
            <p className="text-caption text-[var(--ink-faint)]">
              还没有记录。可以记婚嫁、迁徙、褒学等。
            </p>
          )}
          {events.map((ev) => (
            <div
              key={ev.id}
              className="space-y-2 rounded-xl border border-[var(--glass-edge)] p-2.5"
            >
              <div className="flex items-center gap-2">
                <select
                  value={ev.type}
                  onChange={(e) =>
                    update(ev.id, { type: e.target.value as EventType })
                  }
                  aria-label="事件类型"
                  className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass)] px-2 py-1 text-caption text-[var(--ink)]"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVENT_LABELS[t]}
                    </option>
                  ))}
                </select>
                <Input
                  value={ev.date}
                  onChange={(e) => update(ev.id, { date: e.target.value })}
                  placeholder="时间，如：约1950"
                  className="h-8 flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(ev.id)}
                  title="删除事件"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                value={ev.place ?? ""}
                onChange={(e) => update(ev.id, { place: e.target.value })}
                placeholder="地点（可选）"
                className="h-8"
              />
              <Input
                value={ev.note ?? ""}
                onChange={(e) => update(ev.id, { note: e.target.value })}
                placeholder="备注（可选）"
                className="h-8"
              />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="h-3.5 w-3.5" />
            新增事件
          </Button>
        </div>
      )}
    </div>
  );
}

/* ───────── Edit Sheet ───────── */

function PersonEditSheet({
  open,
  person,
  state,
  isMe,
  isFocus,
  wufu,
  onOpenChange,
  onSave,
  onDelete,
  onSetMe,
  onRecenter,
  onAddRelation,
}: {
  open: boolean;
  person: Person | null;
  state: FamilyState;
  isMe: boolean;
  isFocus: boolean;
  wufu: WufuResult | null;
  onOpenChange: (open: boolean) => void;
  onSave: (p: Person) => void;
  onDelete: (id: string) => void;
  onSetMe: (id: string) => void;
  onRecenter: (id: string) => void;
  onAddRelation: (mode: RelationKind) => void;
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

          {/* 推导出来的信息集中放在这里：都不是存储字段，改生年/关系后自动重算 */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {(() => {
              const z = zodiacOf(draft.birthYear);
              return z ? (
                <span className="rounded-full bg-[var(--glass-strong)] px-2 py-0.5 text-caption text-[var(--ink-soft)]">
                  属{z.label}
                  {z.approx && <span className="text-[var(--ink-faint)]">（推）</span>}
                </span>
              ) : null;
            })()}
            {(() => {
              const age = lifespanOf(draft);
              return age !== null ? (
                <span className="rounded-full bg-[var(--glass-strong)] px-2 py-0.5 text-caption text-[var(--ink-soft)]">
                  享年 {age}
                </span>
              ) : null;
            })()}
            {wufu && (
              <span
                className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-caption text-[var(--accent)]"
                title={`${wufu.basis} · 服期 ${wufu.months}`}
              >
                {wufu.grade}
              </span>
            )}
          </div>
          {wufu && (
            <p
              className="truncate pt-1 text-caption text-[var(--ink-faint)]"
              title={wufu.basis}
            >
              <span className="text-[var(--ink-soft)]">{wufu.grade}</span>
              （{wufu.months}） · {wufu.basis}
            </p>
          )}
        </SheetHeader>

        {/* 纵向可滚动；保存按钮在滚动区之外，不会被推走 */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
          <div className="space-y-1">
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

          <div className="space-y-1">
            <Label htmlFor="p-birth-y">出生年月日</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-2">
              <Input
                id="p-birth-y"
                inputMode="numeric"
                placeholder="年，如 1950"
                value={draft.birthYear ?? ""}
                onChange={(e) => set("birthYear", e.target.value)}
                maxLength={8}
              />
              <Input
                aria-label="出生月"
                inputMode="numeric"
                placeholder="月"
                value={draft.birthMonth ?? ""}
                onChange={(e) => set("birthMonth", e.target.value)}
                maxLength={2}
              />
              <Input
                aria-label="出生日"
                inputMode="numeric"
                placeholder="日"
                value={draft.birthDay ?? ""}
                onChange={(e) => set("birthDay", e.target.value)}
                maxLength={2}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="p-death-y">逝世年月日</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-2">
              <Input
                id="p-death-y"
                inputMode="numeric"
                placeholder="年"
                value={draft.deathYear ?? ""}
                onChange={(e) => set("deathYear", e.target.value)}
                maxLength={8}
              />
              <Input
                aria-label="逝世月"
                inputMode="numeric"
                placeholder="月"
                value={draft.deathMonth ?? ""}
                onChange={(e) => set("deathMonth", e.target.value)}
                maxLength={2}
              />
              <Input
                aria-label="逝世日"
                inputMode="numeric"
                placeholder="日"
                value={draft.deathDay ?? ""}
                onChange={(e) => set("deathDay", e.target.value)}
                maxLength={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="p-home">籍贯</Label>
              <Input
                id="p-home"
                placeholder="浙江省三门县"
                value={draft.ancestralHome ?? ""}
                onChange={(e) => set("ancestralHome", e.target.value)}
                maxLength={50}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-hh">户籍</Label>
              <Input
                id="p-hh"
                placeholder="浙江省三门县"
                value={draft.household ?? ""}
                onChange={(e) => set("household", e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="p-note">备注</Label>
            <Input
              id="p-note"
              placeholder="可选"
              value={draft.note ?? ""}
              onChange={(e) => set("note", e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="p-photo">照片链接</Label>
            <Input
              id="p-photo"
              placeholder="https://… 外置图片地址（可留空）"
              value={draft.photoUrl ?? ""}
              onChange={(e) => set("photoUrl", e.target.value)}
              inputMode="url"
            />
          </div>

          <FamilyEventList
            events={draft.events ?? []}
            onChange={(next) => set("events", next)}
          />
        </div>

        {/* 添加亲属的入口。原本挂在树的空槽上，改用画布后必须换个地方。 */}
        <div className="space-y-1 pt-1">
          <Label>添加亲属</Label>
          <div className="flex flex-wrap gap-1.5">
            {!getFatherId(state, draft.id) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddRelation("father")}
              >
                + 父亲
              </Button>
            )}
            {!getMotherId(state, draft.id) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddRelation("mother")}
              >
                + 母亲
              </Button>
            )}
            {getPartnerIds(state, draft.id).length === 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddRelation("spouse")}
              >
                + 配偶
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddRelation("child")}
            >
              + 子女
            </Button>
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
            {/* 卡片点击不再重定心（免得被误当成切换「我」），所以这里显式给一个 */}
            {!isFocus && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onRecenter(draft.id)}
              >
                <Home className="h-4 w-4" />
                以此人为中心
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
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
            <div className="space-y-1">
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
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-2">
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
