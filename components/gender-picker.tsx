"use client";

import { Label } from "@/components/ui/label";
import { PillToggle } from "@/components/ui/pill-toggle";
import type { Gender } from "@/lib/family";

export function GenderPicker({
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
          <PillToggle
            key={v}
            active={value === v}
            onClick={() => onChange(v)}
            className="h-10 rounded-2xl text-body"
          >
            {label}
          </PillToggle>
        ))}
      </div>
    </div>
  );
}
