"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * 玻璃风格的确认弹窗，替代原生 window.confirm：
 * 原生弹窗不可定制、阻塞主线程，与整体视觉完全割裂。
 *
 * 危险操作（删除/导入覆盖/清空）统一走这里；确认动作由调用方
 * 以闭包形式给出，弹窗本身不碰数据。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <SheetContent side="center">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "solid"}
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
