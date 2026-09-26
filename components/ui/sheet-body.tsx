"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 弹窗的纵向可滚动内容区。弹窗内容一律纵向可滚动（既定约定），
 * `px-1` 是给 focus:ring-2 留的裁剪余量——overflow-y-auto 容器
 * 会在另一轴上也变 auto，把 ring 裁掉。
 */
export function SheetBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-1", className)}>
      {children}
    </div>
  );
}
