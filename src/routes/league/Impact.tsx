import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  CalendarCheck,
  ExternalLink,
  FilePlus2,
  Hourglass,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { CAUSES, fmt } from "../../data";
import { PROJECT_MAX_POINTS, PROJECT_MIN_POINTS, projectPoints } from "../../data/projects";
import { activeMembership } from "../../lib/api";
import { useImpact, useSubmitProject } from "../../lib/queries";
import { Photo, SectionHead } from "../../ui";
import { useLeagueContext } from "./context";
import { cn } from "../../utils/cn";

export default function LeagueImpact() {
  const { league: l, edition } = useLeagueContext();
  const c = CAUSES[l.cause];
  const color = c.color === "#14110d" ? "#4a4338" : c.color;
  const membership = activeMembership(edition.me, l.id);
  const submit = useSubmitProject();
  const { data: impact } = useImpact(l.id);

  const totals = impact?.totals ?? null;
  const byChapter = impact?.byChapter ?? [];
  const byCategory = (impact?.byCategory ?? []).filter((category) => category.points !== 0);
  const byMonth = impact?.byMonth ?? [];
  const projects = impact?.projects ?? [];
  const peak = Math.max(...byChapter.map((chapter) => chapter.points), 1);
  const monthPeak = Math.max(...byMonth.map((month) => Math.abs(month.points)), 1);

  const [form, setForm] = useState({
    chapterId: l.chapters[0]?.id ?? "",
    title: "",
    summary: "",
    occurredOn: new Date().toISOString().slice(0, 10),
    people: 8,
    hours: 16,
    amount: "",
    evidenceUrl: "",
  });
  const preview = projectPoints({
    people: Number(form.people) || 0,
    hours: Number(form.hours) || 0,
    amount: form.amount,
  });

  const fileProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit.mutate(
      { leagueId: l.id, ...form, people: Number(form.people), hours: Number(form.hours) },
      {
        onSuccess: () =>
          setForm((previous) => ({
            ...previous,
            title: "",
            summary: "",
            amount: "",
            evidenceUrl: "",
          })),
      },
    );
  };

  return (
    <div className="space-y-10">
      <SectionHead
        kicker="The record"
        title={
          <>
            What the league has <em>done</em>
          </>
        }
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <TrendingUp size={13} /> {l.delta > 0 ? `+${l.delta}` : l.delta}% pace this month
          </span>
        }
      />

      <div className="border-ink grid grid-cols-2 border-y-2 md:grid-cols-4">
        {[
          { icon: CalendarCheck, value: fmt(totals?.projects ?? l.projects), label: "Projects delivered", tone: "#d9381e" },
          {
            icon: Hourglass,
            value: `${((totals?.hours ?? l.hours) / 1000).toFixed(1)}k`,
            label: "Hours given",
            tone: "#2347c5",
          },
          { icon: Users, value: fmt(l.members), label: "Members", tone: color },
          { icon: Sparkles, value: fmt(totals?.points ?? l.points), label: "Justice Points", tone: "#1b7f5c" },
        ].map((stat, index) => (
          <div
            key={stat.label}
            className={`flex items-center gap-3 px-1 py-4 md:px-3 ${index > 0 ? "border-ink border-l" : ""}`}
          >
            <span
              className="text-paper grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{ background: stat.tone }}
            >
              <stat.icon size={17} />
            </span>
            <div>
              <div className="font-display text-2xl leading-none font-black">{stat.value}</div>
              <div className="kicker text-ink-3 mt-1 text-[9px]">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {membership && (
        <details key={l.id} className="border-ink bg-paper-2 group border-2">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="kicker text-ink flex items-center gap-1.5">
              <FilePlus2 size={13} /> File a completed project
            </span>
            <span className="text-ink-3 font-mono text-[10px]">
              {PROJECT_MIN_POINTS}–{PROJECT_MAX_POINTS} JP · steward approval required
            </span>
          </summary>
          <form
            onSubmit={fileProject}
            className="border-ink/20 grid gap-3 border-t px-4 py-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <label className="block sm:col-span-2">
              <span className="kicker text-ink-3 text-[9px]">Project title</span>
              <input
                required
                minLength={4}
                maxLength={90}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Spring riverfront clean-up"
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">Chapter</span>
              <select
                value={form.chapterId}
                onChange={(event) => setForm({ ...form, chapterId: event.target.value })}
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              >
                {l.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.hood}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">Date</span>
              <input
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={form.occurredOn}
                onChange={(event) => setForm({ ...form, occurredOn: event.target.value })}
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">People</span>
              <input
                type="number"
                required
                min={1}
                max={5000}
                value={form.people}
                onChange={(event) => setForm({ ...form, people: Number(event.target.value) })}
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">Volunteer hours</span>
              <input
                type="number"
                required
                min={0}
                max={10000}
                step="0.5"
                value={form.hours}
                onChange={(event) => setForm({ ...form, hours: Number(event.target.value) })}
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">Measured result</span>
              <input
                maxLength={60}
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                placeholder="14 bags of litter"
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <label className="block">
              <span className="kicker text-ink-3 text-[9px]">Evidence link</span>
              <input
                maxLength={300}
                value={form.evidenceUrl}
                onChange={(event) => setForm({ ...form, evidenceUrl: event.target.value })}
                placeholder="https://…"
                className="border-ink bg-paper mt-1 w-full border-2 px-2.5 py-2 font-sans text-xs"
              />
            </label>
            <label className="block sm:col-span-2 lg:col-span-4">
              <span className="kicker text-ink-3 text-[9px]">What happened</span>
              <textarea
                required
                minLength={20}
                maxLength={500}
                rows={2}
                value={form.summary}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
                placeholder="What the league finished, who showed up, and what changed."
                className="border-ink bg-paper mt-1 w-full resize-y border-2 px-2.5 py-2 font-serif text-sm"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={submit.isPending}
                className="btn-press border-ink bg-ink text-paper rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40"
              >
                {submit.isPending ? "Filing…" : "Send to the review desk"}
              </button>
              <span className="text-ink-2 font-mono text-[10px]">
                Worth <strong>+{preview} JP</strong> on approval · 50 + 4×hours + 2×people
              </span>
            </div>
          </form>
        </details>
      )}

      <section>
        <SectionHead
          kicker="Where the points live"
          title={
            <>
              Chapter by <em>chapter</em>
            </>
          }
          right={
            <span className="text-ink-3 font-mono text-[11px]">
              {byChapter.reduce((sum, chapter) => sum + chapter.projects, 0)} approved here
            </span>
          }
        />
        <div className="space-y-4">
          {byChapter.length === 0 && (
            <p className="text-ink-3 font-serif text-sm">The chapter ledger is still being assembled.</p>
          )}
          {byChapter.map((chapter, index) => (
            <div key={chapter.chapterId}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="font-display flex items-baseline gap-2 text-base font-bold">
                  {chapter.hood}
                  {index === 0 && <span className="kicker text-forest text-[8px]">Leading</span>}
                </span>
                <span className="text-ink-2 font-mono text-[10px]">
                  {fmt(chapter.points)} JP · {chapter.share}%
                </span>
              </div>
              <div className="bg-paper-3 border-ink/30 h-3 overflow-hidden border">
                <div
                  className="h-full transition-[width] duration-700"
                  style={{ width: `${Math.max((chapter.points / peak) * 100, 2)}%`, background: color }}
                />
              </div>
              <div className="text-ink-3 mt-1 flex items-center gap-3 font-mono text-[9px]">
                <span>{chapter.name}</span>
                {chapter.monthPoints !== 0 && (
                  <span className={chapter.monthPoints > 0 ? "text-forest" : "text-vermilion"}>
                    {chapter.monthPoints > 0 ? "+" : ""}
                    {fmt(chapter.monthPoints)} this month
                  </span>
                )}
                <span className="ml-auto">{chapter.projects} projects</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-ink-3 mt-4 font-mono text-[10px]">
          Bars are scaled to the largest chapter. Chapter totals add up to {fmt(totals?.points ?? l.points)} JP — never
          more.
        </p>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div>
          <h3 className="font-display mb-4 flex items-center gap-2 text-2xl font-bold italic">
            <BarChart3 size={20} className="text-vermilion" /> How the points were earned
          </h3>
          <ul className="divide-ink/20 border-ink divide-y-2 border-y-2">
            {byCategory.map((category) => (
              <li key={category.key} className="flex items-baseline gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate font-serif text-sm">{category.label}</span>
                <span className="text-ink-3 font-mono text-[10px]">{category.entries} entries</span>
                <span
                  className={cn(
                    "w-20 text-right font-mono text-sm font-semibold tabular-nums",
                    category.points < 0 && "text-vermilion",
                  )}
                >
                  {category.points > 0 ? "+" : ""}
                  {fmt(category.points)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink-3 mt-2 font-mono text-[9px]">
            Imported chapter history is the sealed printed edition. It counts toward totals but has no local author.
          </p>
        </div>

        <div>
          <h3 className="font-display mb-4 flex items-center gap-2 text-2xl font-bold italic">
            <TrendingUp size={20} className="text-forest" /> Points, by month
          </h3>
          {byMonth.length === 0 ? (
            <p className="text-ink-3 font-serif text-sm">Monthly totals appear once the live ledger has entries.</p>
          ) : (
            <>
              <div className="border-ink flex h-40 items-end gap-1.5 border-b-2">
                {byMonth.map((month) => (
                  <div key={month.month} className="group relative flex h-full flex-1 flex-col justify-end">
                    <div
                      className="border-ink border-2 border-b-0 transition-colors"
                      style={{
                        height: `${Math.max((Math.abs(month.points) / monthPeak) * 100, 2)}%`,
                        background: month.points < 0 ? "#d9381e" : color,
                      }}
                      title={`${month.label}: ${fmt(month.points)} JP`}
                    />
                    <span className="text-ink-3 mt-1 text-center font-mono text-[9px]">{month.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-ink-3 mt-2 font-mono text-[9px]">
                Last twelve calendar months, straight from the ledger.
              </p>
            </>
          )}
        </div>
      </section>

      <section>
        <SectionHead
          kicker="On the record"
          title={
            <>
              Recent <em>wins</em>
            </>
          }
          right={
            <Link to="/ledger" className="kicker hover:text-vermilion flex items-center gap-1">
              <ExternalLink size={11} /> Public ledger
            </Link>
          }
        />
        {projects.length === 0 ? (
          <div className="border-ink/40 border-2 border-dashed py-10 text-center">
            <p className="font-display text-ink-3 text-lg italic">No wins filed yet. The first one is the hardest.</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {projects.map((project) => (
              <article key={project.id} className="hover-color group border-ink flex flex-col border-2">
                <Photo id={l.photo} w={640} h={360} alt="" className="border-ink aspect-[16/9] w-full border-b-2" />
                <div className="flex flex-1 flex-col p-4">
                  <div className="kicker text-vermilion flex items-center gap-1.5">
                    <Sparkles size={11} /> +{project.points} JP
                  </div>
                  <h3 className="font-display mt-1 text-lg leading-tight font-bold">{project.title}</h3>
                  {project.chapterName && (
                    <div className="text-ink-3 mt-1 font-mono text-[10px]">{project.chapterName}</div>
                  )}
                  <div className="text-ink-2 mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 font-mono text-[10px]">
                    <span>{project.people} people</span>
                    <span>{project.hours} hours</span>
                    {project.amount && <span className="font-semibold">{project.amount}</span>}
                    {project.evidenceUrl && (
                      <a
                        href={project.evidenceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="hover:text-vermilion flex items-center gap-1 underline underline-offset-2"
                      >
                        Evidence <ExternalLink size={9} />
                      </a>
                    )}
                    <span className="text-ink-3 ml-auto">
                      {new Date(project.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
