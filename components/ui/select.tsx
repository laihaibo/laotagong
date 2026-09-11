import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 玻璃风格的原生 `<select>`。
 *
 * 刻意不用 Radix Select：原生控件在移动端直接调起系统选择器，
 * 手感更好、体积为零，而且键盘与无障碍行为免费。
 * 代价是样式受限，所以用 `appearance-none` + 自绘箭头把它拉回设计语言。
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "h-11 w-full appearance-none rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] py-2 pl-3.5 pr-9 text-body text-[var(--ink)] backdrop-blur-xl outline-none transition-all duration-200",
        "focus:border-[var(--accent)] focus:bg-[var(--glass-strong)] focus:ring-2 focus:ring-[var(--me-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]"
    />
  </div>
));
Select.displayName = "Select";

export { Select };
