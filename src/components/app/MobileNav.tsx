import { Check, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type { MobilePanel } from "./types";

export function MobileNav({
  activePanel,
  onPanelChange,
}: {
  activePanel: MobilePanel;
  onPanelChange: (panel: MobilePanel) => void;
}) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-zinc-200 bg-zinc-50/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <MobileNavTab
        active={activePanel === "habits"}
        label="Habits"
        icon={<Check className="size-5" />}
        onClick={() => onPanelChange("habits")}
      />
      <MobileNavTab
        active={activePanel === "trends"}
        label="Trends"
        icon={<TrendingUp className="size-5" />}
        onClick={() => onPanelChange("trends")}
      />
    </nav>
  );
}

function MobileNavTab({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Show ${label}`}
      onClick={onClick}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        active
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
