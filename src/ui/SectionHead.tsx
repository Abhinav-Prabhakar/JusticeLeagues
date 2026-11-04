import type { ReactNode } from "react";

export function SectionHead({
  kicker,
  title,
  icon,
  right,
  id,
}: {
  kicker: string;
  title: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  id?: string;
}) {
  return (
    <header id={id} className="mb-6 scroll-mt-24">
      <div className="rule-double" />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {icon && <div className="hidden sm:block">{icon}</div>}
          <div>
            <div className="kicker text-vermilion">{kicker}</div>
            <h2 className="font-display text-4xl leading-none font-black tracking-tight md:text-5xl">{title}</h2>
          </div>
        </div>
        {right}
      </div>
    </header>
  );
}
