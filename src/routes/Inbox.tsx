import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  BellRing,
  CalendarClock,
  CheckCheck,
  Flag,
  Inbox as InboxIcon,
  MailOpen,
  Megaphone,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { useApp } from "../ctx";
import { useEdition, useInbox, useMarkNotificationsRead } from "../lib/queries";
import type { NotificationDTO, NotificationKind } from "../lib/types";
import { usePageTitle } from "../lib/usePageTitle";
import { SectionHead } from "../ui";
import { cn } from "../utils/cn";

const KIND: Record<NotificationKind, { icon: typeof Bell; tint: string; label: string }> = {
  welcome: { icon: Sparkles, tint: "bg-mustard text-ink", label: "Welcome" },
  join: { icon: UserPlus, tint: "bg-forest text-paper", label: "Charter" },
  shift: { icon: CalendarClock, tint: "bg-vermilion text-paper", label: "Shift" },
  reminder: { icon: Bell, tint: "bg-paper-3 text-ink", label: "Reminder" },
  waitlist: { icon: Users, tint: "bg-mustard text-ink", label: "Waitlist" },
  promotion: { icon: Megaphone, tint: "bg-forest text-paper", label: "Promotion" },
  project: { icon: Sparkles, tint: "bg-verdant text-ink", label: "Project" },
  ledger: { icon: CheckCheck, tint: "bg-paper-3 text-ink", label: "Ledger" },
  moderation: { icon: ShieldCheck, tint: "bg-vermilion text-paper", label: "Moderation" },
  strike: { icon: Flag, tint: "bg-vermilion text-paper", label: "Strike" },
  role: { icon: ShieldCheck, tint: "bg-ink text-paper", label: "Editor" },
  invite: { icon: MailOpen, tint: "bg-forest text-paper", label: "Invite" },
};

function when(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Where a note wants to take you. Every path stays inside the paper. */
function destination(note: NotificationDTO, isAdmin: boolean): string {
  if (note.kind === "role") return "/admin";
  if (note.refType === "report" && isAdmin) return "/admin?tab=reports";
  if (note.refType === "strike") return "/privacy#strikes";
  if (note.leagueId) {
    if (note.refType === "shift") return `/leagues/${note.leagueId}/shifts`;
    if (note.refType === "project" && isAdmin) return `/admin?tab=reports`;
    return `/leagues/${note.leagueId}`;
  }
  return "/dashboard";
}

export default function Inbox() {
  usePageTitle("Your inbox — The Justice Leagues");
  const { data: edition } = useEdition();
  const me = edition.me;
  const isAdmin = me?.profile.role === "admin";
  const { data, isPending, isError } = useInbox(Boolean(me));
  const markRead = useMarkNotificationsRead();
  const { toast } = useApp();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  if (!me) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <Bell size={28} className="text-vermilion mx-auto" />
        <h1 className="font-display mt-3 text-4xl font-black">Your inbox waits</h1>
        <p className="text-ink-2 mt-2 font-serif">
          Sign in to read notices about signups, approvals, reminders, and waitlist promotions.
        </p>
        <Link
          to="/login?next=%2Finbox"
          className="btn-press border-ink bg-ink text-paper mt-6 inline-flex rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const items = data?.items ?? [];
  const unread = data?.unread ?? me.unread;
  const visible = filter === "unread" ? items.filter((item) => !item.readAt) : items;

  return (
    <div className="space-y-8 pt-6 pb-12">
      <SectionHead
        kicker="The post"
        title={
          <>
            Your <em>inbox</em>
          </>
        }
        icon={<InboxIcon size={40} className="text-vermilion" />}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="border-ink bg-paper flex rounded-full border-2 p-0.5">
              {[
                { value: "all" as const, label: "All" },
                { value: "unread" as const, label: `Unread${unread ? ` (${unread})` : ""}` },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  aria-pressed={filter === option.value}
                  className={cn(
                    "rounded-full px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase transition-colors",
                    filter === option.value ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                markRead.mutate(undefined, {
                  onSuccess: (result) => toast(result.updated ? `${result.updated} notes marked read` : "Nothing unread"),
                })
              }
              disabled={unread === 0 || markRead.isPending}
              className="btn-press border-ink bg-paper hover:bg-paper-2 flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40"
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          </div>
        }
      />

      <p className="text-ink-2 max-w-2xl font-serif text-sm">
        Every notice is written by the server inside the same transaction as the action that caused it. A signup, an
        approval, a reminder, a waitlist promotion — one row each, tied to the league and the record it came from.
      </p>

      {isPending ? (
        <div className="space-y-3" aria-label="Loading inbox">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="border-ink/15 border-2 p-4">
              <div className="bg-paper-3 h-3 w-28 animate-pulse rounded" />
              <div className="bg-paper-3 mt-2 h-4 w-2/3 animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="border-vermilion bg-paper border-l-4 px-4 py-3 font-serif text-sm">
          The inbox could not be loaded. The local API may still be starting.
        </div>
      ) : visible.length === 0 ? (
        <div className="border-ink/40 grid place-items-center gap-2 border-2 border-dashed px-6 py-14 text-center">
          <BellRing size={24} className="text-ink-3" />
          <p className="font-display text-ink-3 text-xl italic">
            {filter === "unread" ? "Nothing unread." : "The postbag is empty."}
          </p>
          <p className="text-ink-2 max-w-md font-serif text-sm">
            Join a league or claim a shift and the notices will find you.
          </p>
        </div>
      ) : (
        <ol className="divide-ink/20 border-ink divide-y-2 border-y-2">
          {visible.map((note) => {
            const meta = KIND[note.kind] ?? KIND.welcome;
            const Icon = meta.icon;
            const unreadNote = !note.readAt;
            return (
              <li key={note.id} className={cn("group relative flex gap-3 px-1 py-4 sm:gap-4", unreadNote && "bg-paper-2/50")}>
                <span
                  className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full", meta.tint)}
                  aria-hidden
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="kicker text-ink-3 text-[8px]">{meta.label}</span>
                    <span className="text-ink-3 font-mono text-[9px]">{when(note.createdAt)}</span>
                    {unreadNote && (
                      <span className="bg-vermilion inline-block h-1.5 w-1.5 rounded-full" aria-label="Unread" />
                    )}
                  </div>
                  <Link
                    to={destination(note, isAdmin)}
                    onClick={() => {
                      if (unreadNote) markRead.mutate([note.id]);
                    }}
                    className="font-display hover:text-vermilion mt-0.5 block text-lg leading-snug font-bold underline-offset-4 hover:underline"
                  >
                    {note.title}
                  </Link>
                  {note.body && <p className="text-ink-2 mt-1 max-w-2xl font-serif text-sm">{note.body}</p>}
                </div>
                {unreadNote && (
                  <button
                    type="button"
                    onClick={() => markRead.mutate([note.id])}
                    className="text-ink-3 hover:text-ink hidden shrink-0 self-start font-mono text-[9px] underline underline-offset-2 sm:block"
                  >
                    Mark read
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="border-ink/40 flex flex-wrap items-center justify-between gap-3 border-2 border-dashed px-4 py-3">
        <p className="text-ink-2 font-serif text-sm">
          Only you can read this post. The editor sees moderation notices, never your private reminders.
        </p>
        <Link
          to="/privacy"
          className="kicker text-vermilion hover:text-ink transition-colors"
        >
          Privacy &amp; data
        </Link>
      </div>
    </div>
  );
}
