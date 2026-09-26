"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { GenderPicker } from "@/components/gender-picker";
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
import {
  type FamilyState,
  type Gender,
  type Person,
  type RelationKind,
  areSpouses,
  defaultGenderFor,
  relationBaseOf,
} from "@/lib/family";
import { cn } from "@/lib/utils";

const ADD_TITLES: Record<RelationKind, string> = {
  father: "添加父亲",
  mother: "添加母亲",
  husband: "添加丈夫",
  wife: "添加妻子",
  son: "添加儿子",
  daughter: "添加女儿",
};

export function AddRelationSheet({
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
  mode: RelationKind | null;
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
      setGender(mode ? defaultGenderFor(mode) : "unknown");
    }
  }, [open, mode]);

  const title = mode ? ADD_TITLES[mode] : "添加关系";

  const candidates = useMemo(() => {
    if (!focusId || !mode) return [];
    const base = relationBaseOf(mode);
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
        if (base === "spouse") {
          if (areSpouses(state, focusId, p.id)) return false;
          // 夫/妻已经表达了期望性别；性别未知的候选不排除
          const want = mode === "husband" ? "male" : "female";
          return p.gender === "unknown" || p.gender === want;
        }
        if (base === "child") {
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
              aria-pressed={tab === v}
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
          <SheetBody className="space-y-2">
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                if (!mode) return;
                onCreate(mode, { name: name.trim() || "未命名", gender });
              }}
            >
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
              {relationBaseOf(mode ?? "father") === "child" && (
                <p className="text-caption text-[var(--ink-faint)]">
                  若当前人物有配偶，将自动关联为双亲。
                </p>
              )}
              <Button size="lg" className="w-full" type="submit">
                <Plus className="h-4 w-4" />
                创建并关联
              </Button>
            </form>
          </SheetBody>
        ) : (
          <div className="flex flex-1 flex-col gap-3 overflow-hidden">
            <Input
              placeholder="搜索姓名 / 籍贯 / 户籍"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <SheetBody className="space-y-2 pb-2">
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
                      const base = relationBaseOf(mode);
                      if (base === "child") onLinkChild(p.id);
                      else if (base === "spouse") onLinkSpouse(p.id);
                      else onLinkParent(p.id, base);
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
            </SheetBody>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
