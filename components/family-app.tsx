"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
  Home,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Settings2,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
          next = {
            ...next,
            parents: {
              ...next.parents,
              [focus]: {
                ...next.parents[focus],
                [mode === "father" ? "fatherId" : "motherId"]: person.id,
              },
            },
          };
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
      setState((s) => ({
        ...s,
        parents: {
          ...s.parents,
          [focus]: {
            ...s.parents[focus],
            [role === "father" ? "fatherId" : "motherId"]: parentId,
          },
        },
      }));
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
          <p className="text-sm text-[var(--ink-soft)]">载入中…</p>
        </div>
      </div>
    );
  }

  const isEmpty = Object.keys(state.persons).length === 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-8 pt-5 sm:px-6 lg:max-w-5xl lg:px-8">
      {/* Header */}
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)] sm:text-2xl">
            老太公
          </h1>
          <p className="truncate text-xs text-[var(--ink-faint)] sm:text-sm">
            以「我」为中心的家族图谱
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeCycleButton mode={themeMode} onChange={changeTheme} />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSettingsOpen(true)}
            title="设置"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {focus && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1 text-xs text-[var(--ink-soft)]">
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
              <span className="ml-1 shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
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
          <p className="mb-4 text-sm text-[var(--ink-soft)]">未指定「我」</p>
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

      {/* Settings sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>设置</SheetTitle>
            <SheetDescription>主题与数据管理</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto pb-2">
            <div className="space-y-2">
              <Label>主题</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(THEME_META) as ThemeMode[]).map((m) => {
                  const Icon = THEME_META[m].icon;
                  const active = themeMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => changeTheme(m)}
                      className={cn(
                        "flex h-12 flex-col items-center justify-center gap-1 rounded-2xl text-xs transition-all",
                        active
                          ? "glass-btn text-[var(--ink)]"
                          : "border border-[var(--glass-border)] text-[var(--ink-soft)] hover:bg-[var(--glass-strong)]"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {THEME_META[m].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Collapsible className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)]">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--ink)]"
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                    数据管理（谨慎操作）
                  </span>
                  <ChevronDown className="h-4 w-4 text-[var(--ink-faint)] transition-transform [[data-state=open]_&]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-[var(--glass-edge)] px-4 py-3">
                <p className="mb-3 text-xs leading-relaxed text-[var(--ink-faint)]">
                  导入会覆盖当前数据；清空不可恢复。建议先导出备份。
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={exportJson}
                  >
                    <Download className="h-4 w-4" />
                    导出 JSON
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    导入 JSON
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    onClick={resetAll}
                  >
                    <Trash2 className="h-4 w-4" />
                    清空数据
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <p className="text-center text-[11px] text-[var(--ink-faint)]">
              {Object.keys(state.persons).length} 位成员 · 数据仅保存在本机
            </p>
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
          <div className="glass rounded-full px-4 py-2 text-sm text-[var(--ink)] shadow-lg">
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
        <h2 className="text-xl font-semibold text-[var(--ink)]">
          建立你的家族图谱
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">
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
              "h-10 rounded-2xl text-sm transition-all",
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
                compact
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
            <span className="text-xs">添加子女</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-faint)]">
        {children}
      </span>
      <div className="h-px flex-1 bg-[var(--glass-edge)]" />
    </div>
  );
}

/* ───────── Person Card ───────── */

function PersonCard({
  person,
  roleLabel,
  isMe,
  highlighted,
  compact,
  onEmpty,
  onFocus,
  onEdit,
  onSetMe,
}: {
  person: Person | null;
  roleLabel?: string;
  isMe?: boolean;
  highlighted?: boolean;
  compact?: boolean;
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
        className="empty-slot flex min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-3xl"
      >
        <Plus className="h-5 w-5" />
        <span className="text-xs">{roleLabel ? `添加${roleLabel}` : "添加"}</span>
      </button>
    );
  }

  const initial = person.name.slice(0, 1);
  const years =
    person.birthYear || person.deathYear
      ? `${person.birthYear || "?"}–${person.deathYear || ""}`
      : "";

  return (
    <div
      className={cn(
        "glass-card group relative w-full rounded-3xl transition-transform active:scale-[0.98]",
        compact ? "p-3" : "p-3.5",
        isMe && "me",
        highlighted && !isMe && "focused"
      )}
    >
      <button
        type="button"
        onClick={onFocus}
        className="block w-full text-left"
        aria-label={`查看 ${person.name} 的家庭`}
      >
        <div className={cn("flex items-start gap-3", compact && "gap-2.5")}>
          <div
            className={cn(
              "avatar-ring flex shrink-0 items-center justify-center rounded-2xl font-semibold text-white",
              compact ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm",
              person.gender === "male" && "avatar-male",
              person.gender === "female" && "avatar-female",
              person.gender === "unknown" && "avatar-unknown",
              isMe && "me-pulse"
            )}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <p className="truncate text-[15px] font-semibold leading-tight text-[var(--ink)]">
                {person.name}
              </p>
              {isMe && (
                <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                  我
                </span>
              )}
              {roleLabel && roleLabel !== "我" && !isMe && (
                <span className="shrink-0 rounded-full bg-[var(--glass-strong)] px-1.5 py-0.5 text-[10px] text-[var(--ink-soft)]">
                  {roleLabel}
                </span>
              )}
            </div>
            {years && (
              <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">{years}</p>
            )}
            {(person.ancestralHome || person.household) && (
              <p className="mt-1 truncate text-[11px] text-[var(--ink-soft)]">
                {person.ancestralHome && (
                  <span className="mr-1.5">籍 {person.ancestralHome}</span>
                )}
                {person.household && <span>户 {person.household}</span>}
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
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            编辑人物
            {isMe && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                我
              </span>
            )}
          </SheetTitle>
          <SheetDescription>完善姓名、生卒、籍贯与户籍信息</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto pb-2">
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
      <SheetContent side="bottom">
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
                "rounded-xl py-2 text-sm transition-all",
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
          <div className="flex-1 space-y-3 overflow-y-auto">
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
              <p className="text-xs text-[var(--ink-faint)]">
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
            <div className="flex-1 space-y-2 overflow-y-auto pb-2">
              {candidates.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--ink-faint)]">
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
                        "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-white",
                        p.gender === "male" && "avatar-male",
                        p.gender === "female" && "avatar-female",
                        p.gender === "unknown" && "avatar-unknown"
                      )}
                    >
                      {p.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">
                        {p.name}
                      </p>
                      <p className="truncate text-[11px] text-[var(--ink-soft)]">
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
