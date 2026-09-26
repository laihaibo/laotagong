"use client";

import { Download, RefreshCw, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SheetBody } from "@/components/ui/sheet-body";
import type { ViewPrefs } from "@/lib/view-prefs";
import { cn } from "@/lib/utils";

export function SettingsSheet({
  open,
  onOpenChange,
  viewPrefs,
  onChangeShowMinimap,
  onExport,
  onImport,
  onReset,
  memberCount,
  onReloadDevSample,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewPrefs: ViewPrefs;
  onChangeShowMinimap: (show: boolean) => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  memberCount: number;
  /** 仅开发模式传入；生产下整个区块不渲染 */
  onReloadDevSample?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="center">
        <SheetHeader>
          <SheetTitle>设置</SheetTitle>
          <SheetDescription>显示偏好与数据管理</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-2">
          <Label>显示偏好</Label>
          <button
            type="button"
            aria-pressed={viewPrefs.showMinimap}
            onClick={() => onChangeShowMinimap(!viewPrefs.showMinimap)}
            className={cn(
              "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-all",
              viewPrefs.showMinimap
                ? "glass-btn text-[var(--ink)]"
                : "border-[var(--glass-border)] text-[var(--ink-soft)] hover:bg-[var(--glass-strong)]"
            )}
          >
            <span className="text-body">小地图</span>
            <span className="text-caption text-[var(--ink-faint)]">
              {viewPrefs.showMinimap ? "已显示" : "已隐藏"}
            </span>
          </button>

          <Label>数据管理</Label>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onExport}
          >
            <Download className="h-4 w-4" />
            导出 JSON
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onImport}
          >
            <Upload className="h-4 w-4" />
            导入 JSON
          </Button>
          <Button
            variant="danger"
            className="w-full justify-start"
            onClick={onReset}
          >
            <Trash2 className="h-4 w-4" />
            清空数据
          </Button>
          <p className="pt-1 text-caption text-[var(--ink-faint)]">
            共 {memberCount} 位成员 · 数据仅保存在本机浏览器
          </p>

          {onReloadDevSample && (
            <>
              <Label>开发</Label>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={onReloadDevSample}
              >
                <RefreshCw className="h-4 w-4" />
                重载示例数据
              </Button>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
