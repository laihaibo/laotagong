"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { PillToggle } from "@/components/ui/pill-toggle";
import type { DistanceGroup, FamilyState, Person } from "@/lib/family";
import { cn } from "@/lib/utils";

const SEARCH_FILTERS: Array<{ key: string; label: string }> = [
  { key: "male", label: "男" },
  { key: "female", label: "女" },
  { key: "alive", label: "在世" },
  { key: "dead", label: "已故" },
];

/** 结果列表上限：与关联候选（slice(0, 40)）同一标准，避免超大谱渲染失控 */
const MAX_RESULTS = 40;

/**
 * 搜索与筛选合成一个面板（AC-8）。
 * 结果按「以我为原点」的关系距离分组；同辈一桶同时含配偶与兄弟姐妹（配偶权重为 0）。
 * 分组由 family-app 的派生层算好传入，这里不再自己跑 BFS。
 */
export function SearchPanel({
  state,
  groups,
  onSelect,
}: {
  state: FamilyState;
  groups: DistanceGroup[];
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>([]);

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
          {SEARCH_FILTERS.map((f) => (
            <PillToggle
              key={f.key}
              active={filters.includes(f.key)}
              variant="accent"
              data-filter-chip
              onClick={() => toggle(f.key)}
              className="rounded-full px-3 py-1"
            >
              {f.label}
            </PillToggle>
          ))}
        </div>

        <div className="-mx-1 mt-3 max-h-[50dvh] overflow-y-auto px-1">
          {total === 0 ? (
            <p className="py-6 text-center text-caption text-[var(--ink-faint)]">
              没有匹配的成员
            </p>
          ) : (
            <>
              {(() => {
                let shown = 0;
                return visible.map((g) => {
                  if (shown >= MAX_RESULTS) return null;
                  // 超大谱下全局截断，分组标题仍显示真实数量
                  const ids = g.ids.slice(0, MAX_RESULTS - shown);
                  shown += ids.length;
                  return (
                    <section key={g.key} className="mb-3 last:mb-0">
                      <h2 className="mb-1.5 text-caption font-medium text-[var(--ink-faint)]">
                        {g.label} · {g.ids.length}
                      </h2>
                      <ul className="space-y-1">
                        {ids.map((id) => {
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
                  );
                });
              })()}
              {total > MAX_RESULTS && (
                <p className="py-2 text-center text-caption text-[var(--ink-faint)]">
                  共 {total} 位匹配，已显示前 {MAX_RESULTS} 位，请细化搜索条件
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
