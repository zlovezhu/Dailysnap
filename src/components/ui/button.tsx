import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "default" | "outline" | "ghost" | "accent";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantStyles: Record<Variant, string> = {
  default: "bg-[var(--bg-secondary)] text-[var(--text)] hover:bg-[var(--surface-hover)] border border-[var(--border)]",
  outline: "bg-transparent text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-hover)]",
  ghost: "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] border-none",
  accent: "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] border-none",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-7 px-3 text-xs rounded-[var(--radius-sm)]",
  md: "h-9 px-4 text-sm rounded-[var(--radius-md)]",
  lg: "h-11 px-6 text-sm rounded-[var(--radius-md)]",
  icon: "h-8 w-8 rounded-[var(--radius-sm)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
