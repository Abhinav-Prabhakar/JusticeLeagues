export function RouteSkeleton() {
  return (
    <div className="animate-pulse space-y-8 py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the edition…</span>
      <div className="bg-paper-3 h-3 w-40" />
      <div className="bg-paper-3 h-14 w-2/3" />
      <div className="bg-ink/30 h-[3px] w-full" />
      <div className="grid gap-6 md:grid-cols-3">
        <div className="bg-paper-3 aspect-[4/3] md:col-span-2" />
        <div className="space-y-3">
          <div className="bg-paper-3 h-4 w-full" />
          <div className="bg-paper-3 h-4 w-5/6" />
          <div className="bg-paper-3 h-4 w-3/4" />
          <div className="bg-paper-2 h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
