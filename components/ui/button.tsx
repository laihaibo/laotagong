import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--me-ring)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] select-none",
  {
    variants: {
      variant: {
        glass: "glass-btn text-[var(--ink)] hover:brightness-105",
        solid:
          "bg-[var(--accent)] text-white shadow-[var(--shadow-soft)] hover:opacity-90",
        ghost:
          "text-[var(--ink-soft)] hover:bg-[var(--glass-strong)] hover:text-[var(--ink)]",
        danger:
          "bg-[var(--danger-soft)] text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:brightness-110 backdrop-blur-xl",
        outline:
          "border border-[var(--glass-border)] text-[var(--ink)] hover:bg-[var(--glass-strong)] backdrop-blur-md",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-7 w-7 p-0",
      },
    },
    defaultVariants: {
      variant: "glass",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
