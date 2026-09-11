import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass)] px-4 py-2 text-body text-[var(--ink)] placeholder:text-[var(--ink-faint)] backdrop-blur-xl outline-none transition-all duration-200",
          "focus:border-[var(--accent)] focus:bg-[var(--glass-strong)] focus:ring-2 focus:ring-[var(--me-ring)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
