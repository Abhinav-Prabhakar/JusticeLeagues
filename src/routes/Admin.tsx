import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Ban,
  Check,
  ClipboardList,
  EyeOff,
  Flag,
  Gavel,
  KeyRound,
  Loader2,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { fmt } from "../data";
import { handleLabel } from "../lib/api";
import {
  useAdminOverview,
  useAdminReports,
  useEdition,
  useAdminUsers,
  useAuditLog,
  useFeatureFlags,
  useHandleReport,
  useRestoreUser,
  useRestrictUser,
  useSetFeatureFlag,
  useSetUserRole,
} from "../lib/queries";
import type { AdminUserDTO, FeatureFlagDTO, ReportDTO, ReportStatus } from "../lib/types";
import { usePageTitle } from "../lib/usePageTitle";
import { CountUp, SectionHead } from "../ui";
import { cn } from "../utils/cn";

type Tab = "overview" | "reports" | "people" | "flags" | "audit";

const TABS: { id: Tab; label: string; icon: typeof Scale }[] = [
  { id: "overview", label: "Overview", icon: Scale },
  { id: "reports", label: "Reports", icon: Flag },
  { id: "people", label: "People", icon: Users },
  { id: "flags", label: "Flags", icon: SlidersHorizontal },
  { id: "audit", label: "Audit log", icon: ClipboardList },
];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Admin() {
  usePageTitle("The editor's desk — The Justice Leagues");
  const { data: edition } = useEdition();
  const me = edition.me;
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = (TABS.some((item) => item.id === raw) ? raw : "overview") as Tab;

  if (!me) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <ShieldCheck size={30} className="text-vermilion mx-auto" />
        <h1 className="font-display mt-3 text-4xl font-black">Editors only</h1>
        <p className="text-ink-2 mt-2 font-serif">Sign in with the editor account to open the desk.</p>
        <Link
          to="/login?next=%2Fadmin"
          className="btn-press border-ink bg-ink text-paper mt-6 inline-flex rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (me.profile.role !== "admin") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <Ban size={30} className="text-vermilion mx-auto" />
        <h1 className="font-display mt-3 text-4xl font-black">The desk is closed</h1>
        <p className="text-ink-2 mt-2 font-serif">
          The admin console belongs to the editor. Stewards run their own leagues from the Steward tab.
        </p>
        <Link
          to="/dashboard"
          className="btn-press border-ink bg-paper mt-6 inline-flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
        >
          Back to your desk <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-7 pt-6 pb-12">
      <SectionHead
        kicker="The editor's desk"
        title={
          <>
            Trust &amp; <em>operations</em>
          </>
        }
        icon={<ShieldCheck size={40} className="text-vermilion" />}
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <KeyRound size={12} /> @{me.profile.handle || me.profile.displayName}
          </span>
        }
      />

      <p className="text-ink-2 max-w-3xl font-serif text-sm">
        Reports, strikes, accounts, and switches. Every action here writes an audit row, and hiding content never
        deletes it. The desk exists so a city of strangers can run without the founder editing the database by hand.
      </p>

      <div className="border-ink no-scrollbar flex gap-1 overflow-x-auto border-b-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setParams(item.id === "overview" ? {} : { tab: item.id })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-0.5 flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase transition-colors",
                active
                  ? "border-vermilion text-ink"
                  : "text-ink-3 hover:text-ink border-transparent",
              )}
            >
              <Icon size={13} /> {item.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <Overview />}
      {tab === "reports" && <ReportQueue />}
      {tab === "people" && <People />}
      {tab === "flags" && <Flags />}
      {tab === "audit" && <AuditLog />}
    </div>
  );
}

function Overview() {
  const { data, isPending, isError } = useAdminOverview();
  if (isPending) return <Skeleton label="Loading the overview" />;
  if (isError || !data) return <Failure message="The overview could not be loaded." />;

  const stats = [
    { label: "Neighbours", value: data.people, icon: Users, tint: "bg-forest text-paper" },
    { label: "Leagues", value: data.leagues, icon: Scale, tint: "bg-mustard text-ink" },
    { label: "Open reports", value: data.openReports, icon: Flag, tint: "bg-vermilion text-paper" },
    { label: "Restricted", value: data.restricted, icon: Ban, tint: "bg-ink text-paper" },
    { label: "Strikes on file", value: data.strikes, icon: Gavel, tint: "bg-paper-3 text-ink" },
    { label: "Ledger rows", value: data.ledgerRows, icon: ClipboardList, tint: "bg-paper-3 text-ink" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="border-ink bg-paper flex items-center gap-3 border-2 px-4 py-3">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", stat.tint)}>
                <Icon size={17} />
              </span>
              <div>
                <div className="font-display text-3xl leading-none font-black tabular-nums">
                  <CountUp value={stat.value} />
                </div>
                <div className="kicker text-ink-3 mt-1 text-[8px]">{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-ink bg-paper-2 grid gap-4 border-2 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="bg-ink text-mustard grid h-14 w-14 place-items-center rounded-full">
          <Scale size={24} />
        </div>
        <div>
          <div className="kicker text-vermilion">On the record</div>
          <p className="font-display text-2xl leading-tight font-black">
            <CountUp value={data.points} /> Justice Points across {fmt(data.ledgerRows)} ledger rows
          </p>
          <p className="text-ink-2 mt-1 font-serif text-sm">
            Points are server-authored and append-only. A reversal is a second row, never an edit.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReportQueue() {
  const [status, setStatus] = useState<ReportStatus | "all">("open");
  const { data, isPending, isError } = useAdminReports(status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="border-ink bg-paper flex rounded-full border-2 p-0.5">
          {(["open", "actioned", "dismissed", "all"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatus(option)}
              aria-pressed={status === option}
              className={cn(
                "rounded-full px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase transition-colors",
                status === option ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2",
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <p className="text-ink-3 font-mono text-[10px]">
          {data ? `${data.reports.length} ${status === "all" ? "on file" : status}` : "…"}
        </p>
      </div>

      {isPending ? (
        <Skeleton label="Loading reports" />
      ) : isError ? (
        <Failure message="The report queue could not be loaded." />
      ) : !data || data.reports.length === 0 ? (
        <div className="border-ink/40 grid place-items-center gap-2 border-2 border-dashed px-6 py-12 text-center">
          <Check size={22} className="text-forest" />
          <p className="font-display text-ink-3 text-xl italic">The queue is clear.</p>
          <p className="text-ink-2 font-serif text-sm">No {status === "all" ? "" : status} reports right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: ReportDTO }) {
  const handle = useHandleReport();
  const [note, setNote] = useState("");
  const open = report.status === "open";

  return (
    <article className={cn("border-ink bg-paper border-2", !open && "opacity-80")}>
      <div className="border-ink/15 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase",
            report.status === "open"
              ? "bg-vermilion text-paper"
              : report.status === "actioned"
                ? "bg-forest text-paper"
                : "bg-paper-3 text-ink-2",
          )}
        >
          {report.status}
        </span>
        <span className="kicker text-ink-2 flex items-center gap-1 text-[8px]">
          <Flag size={9} /> {report.reason}
        </span>
        <span className="text-ink-3 font-mono text-[9px]">{shortDate(report.createdAt)}</span>
        <span className="text-ink-3 ml-auto font-mono text-[9px]">
          {report.reporter ? `reported by ${handleLabel(report.reporter)}` : "reporter deleted"}
        </span>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div>
          <div className="kicker text-ink-3 text-[8px]">
            {report.targetType} · {report.leagueName ?? "no league"}
          </div>
          <h3 className="font-display text-xl leading-tight font-black">{report.targetTitle}</h3>
          {report.targetAuthor && (
            <p className="text-ink-3 mt-0.5 font-mono text-[10px]">
              posted by {handleLabel(report.targetAuthor)}
              {report.targetAuthor.minor ? " · young neighbour" : ""}
            </p>
          )}
        </div>

        {report.detail && <p className="text-ink-2 border-ink/30 border-l-2 pl-3 font-serif text-sm">{report.detail}</p>}

        {open ? (
          <div className="space-y-2">
            <label htmlFor={`note-${report.id}`} className="kicker text-ink-3 block text-[8px]">
              Note to the author (kept in the audit log)
            </label>
            <input
              id={`note-${report.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              placeholder="What did you decide, and why?"
              className="border-ink bg-paper w-full border-2 px-2.5 py-2 font-serif text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handle.mutate({ reportId: report.id, decision: "dismiss", note })}
                disabled={handle.isPending}
                className="btn-press border-ink/40 text-ink-2 hover:border-ink hover:text-ink flex items-center gap-1.5 rounded-full border-2 px-3 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
              >
                <X size={11} /> Dismiss
              </button>
              <button
                type="button"
                onClick={() => handle.mutate({ reportId: report.id, decision: "hide", note })}
                disabled={handle.isPending}
                className="btn-press border-ink bg-mustard text-ink flex items-center gap-1.5 rounded-full border-2 px-3 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
              >
                <EyeOff size={11} /> Hide item
              </button>
              <button
                type="button"
                onClick={() => handle.mutate({ reportId: report.id, decision: "strike", note })}
                disabled={handle.isPending || !report.targetAuthor}
                title={report.targetAuthor ? "Hide the item and record a strike" : "No author to strike"}
                className="btn-press border-ink bg-vermilion text-paper flex items-center gap-1.5 rounded-full border-2 px-3 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
              >
                {handle.isPending ? <Loader2 size={11} className="animate-spin" /> : <Gavel size={11} />} Hide + strike
              </button>
            </div>
          </div>
        ) : (
          <p className="text-ink-2 flex items-start gap-2 font-serif text-sm">
            <BadgeCheck size={15} className="text-forest mt-0.5 shrink-0" />
            {report.resolutionNote || "Handled with no note."}
          </p>
        )}
      </div>
    </article>
  );
}

function People() {
  const { data: edition } = useEdition();
  const meId = edition.me?.profile.id ?? "";
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const { data, isPending, isError } = useAdminUsers(term);

  return (
    <div className="space-y-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setTerm(q.trim());
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="border-ink bg-paper flex min-w-0 flex-1 items-center gap-2 rounded-full border-2 px-3 py-1.5">
          <Search size={14} className="text-ink-3 shrink-0" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            aria-label="Find a neighbour by name, handle, or email"
            placeholder="Find a neighbour by name, handle, or email…"
            className="w-full bg-transparent font-sans text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          className="btn-press border-ink bg-ink text-paper rounded-full border-2 px-4 py-2 font-sans text-[10px] font-extrabold tracking-wider uppercase"
        >
          Search
        </button>
        {term && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setTerm("");
            }}
            className="text-ink-3 hover:text-ink font-mono text-[10px] underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </form>

      <p className="text-ink-3 font-serif text-xs">
        A young neighbour&apos;s handle and email are withheld here as everywhere else. Contact them through their
        steward; that is the safeguarding rule.
      </p>

      {isPending ? (
        <Skeleton label="Loading people" />
      ) : isError ? (
        <Failure message="The directory could not be loaded." />
      ) : !data || data.users.length === 0 ? (
        <p className="text-ink-3 py-8 text-center font-serif">Nobody matches that search.</p>
      ) : (
        <ul className="divide-ink/20 border-ink divide-y-2 border-y-2">
          {data.users.map((user) => (
            <UserRow key={user.profile.id} user={user} meId={meId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UserRow({ user, meId }: { user: AdminUserDTO; meId: string }) {
  const role = useSetUserRole();
  const restrict = useRestrictUser();
  const restore = useRestoreUser();
  const restricted = Boolean(user.restrictedUntil);
  const self = user.profile.id === meId;

  return (
    <li className="grid gap-3 px-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-lg leading-tight font-bold">{user.profile.displayName}</span>
          <span className="text-ink-3 font-mono text-[10px]">
            {user.profile.handle ? `@${user.profile.handle}` : "handle private"}
          </span>
          {user.role === "admin" && (
            <span className="bg-ink text-mustard rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase">
              editor
            </span>
          )}
          {user.ageBand === "teen" && (
            <span className="bg-mustard text-ink rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase">
              under 18
            </span>
          )}
          {restricted && (
            <span className="bg-vermilion text-paper rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase">
              paused to {user.restrictedUntil!.slice(0, 10)}
            </span>
          )}
        </div>
        <div className="text-ink-3 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]">
          <span>{user.email ?? "contact via steward"}</span>
          <span>{user.leagues} leagues</span>
          <span>{fmt(user.points)} JP</span>
          <span className={user.strikes > 0 ? "text-vermilion font-semibold" : ""}>{user.strikes} strikes</span>
          <span>joined {shortDate(user.createdAt)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {!self && (
          <button
            type="button"
            onClick={() => role.mutate({ profileId: user.profile.id, role: user.role === "admin" ? "member" : "admin" })}
            disabled={role.isPending}
            className="btn-press border-ink bg-paper hover:bg-paper-2 rounded-full border-2 px-3 py-1.5 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
          >
            {user.role === "admin" ? "Remove editor" : "Make editor"}
          </button>
        )}
        {restricted ? (
          <button
            type="button"
            onClick={() => restore.mutate(user.profile.id)}
            disabled={restore.isPending}
            className="btn-press border-forest bg-forest text-paper flex items-center gap-1 rounded-full border-2 px-3 py-1.5 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
          >
            <RotateCcw size={10} /> Restore
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              restrict.mutate({
                profileId: user.profile.id,
                days: 14,
                reason: "Paused from the editor's desk.",
              })
            }
            disabled={restrict.isPending || self}
            className="btn-press border-ink/40 text-ink-2 hover:border-vermilion hover:text-vermilion flex items-center gap-1 rounded-full border-2 px-3 py-1.5 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
          >
            <Ban size={10} /> Pause 14d
          </button>
        )}
      </div>
    </li>
  );
}

function Flags() {
  const { data, isPending, isError } = useFeatureFlags();
  const setFlag = useSetFeatureFlag();

  if (isPending) return <Skeleton label="Loading switches" />;
  if (isError || !data) return <Failure message="The switches could not be loaded." />;

  return (
    <div className="space-y-4">
      <p className="text-ink-2 max-w-2xl font-serif text-sm">
        Switches are read by the server on every edition load, so a change lands on the next refresh. They are not a
        permission system; they let the editor retire a feature without shipping code.
      </p>
      <ul className="divide-ink/20 border-ink divide-y-2 border-y-2">
        {data.flags.map((flag) => (
          <FlagRow key={flag.key} flag={flag} onToggle={(enabled) => setFlag.mutate({ key: flag.key, enabled })} pending={setFlag.isPending} />
        ))}
      </ul>
    </div>
  );
}

function FlagRow({ flag, onToggle, pending }: { flag: FeatureFlagDTO; onToggle: (enabled: boolean) => void; pending: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-1 py-4">
      <div className="min-w-0 flex-1">
        <div className="font-display text-lg leading-tight font-bold">{flag.label}</div>
        <p className="text-ink-2 mt-0.5 max-w-xl font-serif text-sm">{flag.description}</p>
        <span className="text-ink-3 font-mono text-[9px]">{flag.key}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={flag.enabled}
        aria-label={`${flag.label}: ${flag.enabled ? "on" : "off"}`}
        onClick={() => onToggle(!flag.enabled)}
        disabled={pending}
        className={cn(
          "relative h-8 w-16 shrink-0 rounded-full border-2 transition-colors disabled:opacity-50",
          flag.enabled ? "border-forest bg-forest" : "border-ink/40 bg-paper-3",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full transition-all",
            flag.enabled ? "left-[calc(100%-28px)] bg-paper text-forest" : "left-0.5 bg-ink text-paper",
          )}
        >
          {flag.enabled ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
        </span>
      </button>
    </li>
  );
}

function AuditLog() {
  const { data, isPending, isError } = useAuditLog();

  if (isPending) return <Skeleton label="Loading the audit log" />;
  if (isError || !data) return <Failure message="The audit log could not be loaded." />;

  return (
    <div className="space-y-4">
      <p className="text-ink-2 max-w-2xl font-serif text-sm">
        Append-only. Reports, hides, strikes, role changes, switches, and account deletions all land here with the
        actor and a timestamp.
      </p>
      {data.entries.length === 0 ? (
        <p className="text-ink-3 py-8 text-center font-serif">Nothing on the record yet.</p>
      ) : (
        <ul className="divide-ink/15 border-ink divide-y border-y-2">
          {data.entries.map((entry) => (
            <li key={entry.id} className="grid gap-1 px-1 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
              <span className="bg-paper-3 text-ink-2 w-fit rounded-full px-2 py-0.5 font-mono text-[9px]">
                {entry.action}
              </span>
              <span className="text-ink-2 min-w-0 truncate font-serif text-sm">
                {entry.targetType} <span className="text-ink-3 font-mono text-[10px]">{entry.targetId}</span>
                {entry.leagueName ? ` · ${entry.leagueName}` : ""}
                {entry.actor ? ` · ${handleLabel(entry.actor)}` : " · system"}
              </span>
              <span className="text-ink-3 font-mono text-[9px]">{shortDate(entry.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-3" aria-label={label}>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="border-ink/15 border-2 p-4">
          <div className="bg-paper-3 h-3 w-28 animate-pulse rounded" />
          <div className="bg-paper-3 mt-2 h-4 w-2/3 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <div className="border-vermilion bg-paper flex items-start gap-2 border-l-4 px-4 py-3 font-serif text-sm">
      <AlertTriangle size={15} className="text-vermilion mt-0.5 shrink-0" /> {message}
    </div>
  );
}
