export function VaultPanel({ totalReward }: { totalReward: number }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase text-zinc-500 dark:text-zinc-400">Markdown vault</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        Every click rewrites the tables inside <span className="font-mono text-emerald-700 dark:text-emerald-300">liferl.md</span>.
      </p>
      <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div className="text-xs uppercase text-zinc-500 dark:text-zinc-400">Next level</div>
        <div className="mt-1 text-2xl font-semibold">{Math.max(0, 500 - (totalReward % 500))} xp</div>
      </div>
    </div>
  );
}
