"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 玻璃药丸开关——亲系筛选、五服开关、搜索筛选、性别选择等处
 * 手写的同一视觉模式，归一成组件并统一带上 aria-pressed。
 *
 * 两种激活态：glass（glass-btn 高亮，筛选/性别类）与
 * accent（accent-soft 着色，搜索 chips）。形状差异走 className。
 */
export function PillToggle({
  active,
  variant = "glass",
  className,
  children,
  ...rest
}: {
  active: boolean;
  variant?: "glass" | "accent";
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "transition-all",
        active
          ? variant === "glass"
            ? "glass-btn text-[var(--ink)]"
            : "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border border-[var(--glass-border)] text-[var(--ink-soft)] hover:bg-[var(--glass-strong)]",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
