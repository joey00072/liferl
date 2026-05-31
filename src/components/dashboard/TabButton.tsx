export function TabButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex h-10 min-w-28 items-center justify-center gap-2 px-2 text-sm font-medium transition ${
        active
          ? "text-zinc-950 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-zinc-950 dark:text-zinc-50 dark:after:bg-zinc-50"
          : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
