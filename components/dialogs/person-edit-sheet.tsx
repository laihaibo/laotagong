"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Home, Plus, Trash2, UserCheck } from "lucide-react";

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
  type EventType,
  type FamilyEvent,
  type FamilyState,
  type Person,
  type RelationKind,
  EVENT_TYPES,
  getFatherId,
  getMotherId,
  getPartnerIds,
  lifespanOf,
  newId,
  relationOptions,
  zodiacOf,
  type WufuResult,
} from "@/lib/family";
import { cn } from "@/lib/utils";

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
        id: newId(),
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
                  type="button"
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
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="h-3.5 w-3.5" />
            新增事件
          </Button>
        </div>
      )}
    </div>
  );
}

export function PersonEditSheet({
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

        {/* contents 布局：form 只提供语义与 Enter 提交，不参与 flex 排版。
            表单内所有非提交按钮必须显式 type="button"，否则默认变成 submit。 */}
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ ...draft, updatedAt: Date.now() });
            onOpenChange(false);
          }}
        >
          {/* 纵向可滚动；保存按钮在滚动区之外，不会被推走 */}
          <SheetBody className="space-y-2">
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
        </SheetBody>

        {/* 添加亲属的入口。原本挂在树的空槽上，改用画布后必须换个地方。
            可用性与默认性别规则在 lib 的 relationOptions，与选择面板同源。 */}
        <div className="space-y-1 pt-1">
          <Label>添加亲属</Label>
          <div className="flex flex-wrap gap-1.5">
            {relationOptions(draft.gender, {
              hasFather: !!getFatherId(state, draft.id),
              hasMother: !!getMotherId(state, draft.id),
              hasPartner: getPartnerIds(state, draft.id).length > 0,
            })
              .filter((opt) => !opt.disabledReason)
              .map((opt) => (
                <Button
                  key={opt.kind}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddRelation(opt.kind)}
                >
                  + {opt.label}
                </Button>
              ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <div className="flex gap-2">
            {!isMe && (
              <Button
                type="button"
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
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onRecenter(draft.id)}
              >
                <Home className="h-4 w-4" />
                以此人为中心
              </Button>
            )}
            <Button
              type="button"
              variant="danger"
              size="icon"
              onClick={() => onDelete(draft.id)}
              title="删除"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Button size="lg" type="submit">
            保存
          </Button>
        </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
