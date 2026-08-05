import { createContext, useContext, type ReactNode, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface TabsContextValue {
  active: string;
  onChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({ active, onChange, children, className }: {
  active: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ active, onChange }}>
      <div className={cn("flex", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsTrigger({ value, children, className, ...props }: {
  value: string;
  children: ReactNode;
} & HTMLAttributes<HTMLButtonElement>) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabsTrigger must be used within Tabs");
  const isActive = ctx.active === value;
  return (
    <button
      onClick={() => ctx.onChange(value)}
      className={cn(
        "flex-1 py-2.5 text-sm cursor-pointer transition-all duration-200 border-b-2",
        isActive
          ? "text-[var(--accent)] font-semibold border-[var(--accent)]"
          : "text-[var(--text-tertiary)] font-normal border-transparent hover:text-[var(--text-secondary)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
