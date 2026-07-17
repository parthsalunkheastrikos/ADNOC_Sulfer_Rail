export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-raised panel-shadow before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent ${className}`}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-panel/60 px-3 py-2">
      <span className="eyebrow">{title}</span>
      {children}
    </div>
  );
}
