import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive, Building2, Check, Globe2, Settings2, ShieldCheck, Users } from "lucide-react";
import { CAUSES, CAUSE_KEYS, type Cause } from "../../data";
import { activeMembership } from "../../lib/api";
import { useUpdateLeagueSettings } from "../../lib/queries";
import { SectionHead } from "../../ui";
import { cn } from "../../utils/cn";
import { useLeagueContext } from "./context";

export default function LeagueSettings() {
  const { league: l, edition } = useLeagueContext();
  const navigate = useNavigate();
  const membership = activeMembership(edition.me, l.id);
  const isSteward = membership?.role === "owner" || membership?.role === "steward";
  const isOwner = membership?.role === "owner";
  const update = useUpdateLeagueSettings();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [form, setForm] = useState({
    name: l.name,
    motto: l.motto,
    cause: l.cause as Cause,
    recruiting: l.recruiting,
  });

  if (!isSteward) {
    return (
      <div className="border-ink/40 grid place-items-center gap-3 border-2 border-dashed px-6 py-14 text-center">
        <span className="bg-ink text-paper grid h-12 w-12 place-items-center rounded-full" aria-hidden>
          <Settings2 size={22} />
        </span>
        <p className="font-display text-ink-3 text-xl italic">Stewards only.</p>
        <p className="text-ink-2 max-w-md font-serif text-sm">
          League identity, recruiting, and the archive are kept by the owner and stewards of {l.name}.
        </p>
        <Link
          to={`/leagues/${l.id}`}
          className="btn-press border-ink bg-paper mt-1 rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase"
        >
          Back to the league
        </Link>
      </div>
    );
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate({ leagueId: l.id, ...form });
  };

  const archive = () => {
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    update.mutate({ leagueId: l.id, ...form, archived: true }, { onSuccess: () => navigate("/leagues") });
  };

  return (
    <div className="space-y-8">
      <SectionHead
        kicker="The masthead"
        title={
          <>
            League <em>settings</em>
          </>
        }
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <ShieldCheck size={13} /> {membership.role}
          </span>
        }
      />

      <form onSubmit={save} className="border-ink bg-paper-2 max-w-3xl border-2">
        <div className="border-ink flex items-center justify-between border-b-2 px-5 py-3">
          <span className="kicker text-ink flex items-center gap-1.5">
            <Building2 size={13} /> Identity
          </span>
          <span className="text-ink-3 font-mono text-[9px]">Visible across the atlas</span>
        </div>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="kicker text-ink-3 text-[9px]">League name</span>
            <input
              required
              minLength={3}
              maxLength={80}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="border-ink bg-paper font-display mt-1 w-full border-2 px-3 py-2 text-xl font-bold"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="kicker text-ink-3 text-[9px]">Motto</span>
            <input
              maxLength={120}
              value={form.motto}
              onChange={(event) => setForm({ ...form, motto: event.target.value })}
              className="border-ink bg-paper mt-1 w-full border-2 px-3 py-2 font-serif text-lg italic"
            />
          </label>
          <label className="block">
            <span className="kicker text-ink-3 text-[9px]">Cause</span>
            <select
              value={form.cause}
              onChange={(event) => setForm({ ...form, cause: event.target.value as Cause })}
              className="border-ink bg-paper mt-1 w-full border-2 px-3 py-2 font-sans text-sm"
            >
              {CAUSE_KEYS.map((cause) => (
                <option key={cause} value={cause}>
                  {CAUSES[cause].label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="kicker text-ink-3 text-[9px]">City</span>
            <div className="border-ink/40 text-ink-2 mt-1 flex items-center gap-2 border-2 border-dashed px-3 py-2 font-serif text-sm">
              <Globe2 size={14} /> One city, one paper
            </div>
          </div>
        </div>

        <div className="border-ink/20 grid gap-4 border-t px-5 py-5 sm:grid-cols-2">
          <div>
            <span className="kicker text-ink-3 text-[9px]">Recruiting</span>
            <button
              type="button"
              aria-pressed={form.recruiting}
              onClick={() => setForm({ ...form, recruiting: !form.recruiting })}
              className={cn(
                "mt-1 flex w-full items-center justify-between gap-3 rounded-full border-2 px-4 py-2 font-sans text-[10px] font-extrabold tracking-wider uppercase",
                form.recruiting ? "border-forest bg-forest text-paper" : "border-ink/40 text-ink-2 bg-paper",
              )}
            >
              <span className="flex items-center gap-1.5">
                <Users size={12} /> {form.recruiting ? "Open to neighbours" : "Closed for now"}
              </span>
              <span
                className={cn(
                  "grid h-4 w-4 place-items-center rounded-full border-2",
                  form.recruiting ? "border-paper bg-paper text-forest" : "border-ink/30",
                )}
              >
                {form.recruiting && <Check size={10} strokeWidth={4} />}
              </span>
            </button>
            <p className="text-ink-3 mt-1 font-mono text-[9px]">
              Invitations still work; open joining is what changes.
            </p>
          </div>

          <div>
            <span className="kicker text-ink-3 text-[9px]">The archive</span>
            <button
              type="button"
              onClick={archive}
              disabled={!isOwner || update.isPending}
              className={cn(
                "mt-1 flex w-full items-center justify-between gap-3 rounded-full border-2 px-4 py-2 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40",
                confirmArchive
                  ? "border-vermilion bg-vermilion text-paper"
                  : "border-vermilion/50 text-vermilion bg-paper",
              )}
            >
              <span className="flex items-center gap-1.5">
                <Archive size={12} /> {confirmArchive ? "Confirm archive" : "Archive league"}
              </span>
            </button>
            <p className="text-ink-3 mt-1 font-mono text-[9px]">
              {isOwner ? "Hides the league from the atlas. Data stays on disk." : "Only the owner can archive."}
            </p>
          </div>
        </div>

        <div className="border-ink/20 flex flex-wrap items-center gap-3 border-t px-5 py-4">
          <button
            type="submit"
            disabled={update.isPending}
            className="btn-press border-ink bg-mustard rounded-full border-2 px-5 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-40"
          >
            {update.isPending ? "Saving…" : "Save the masthead"}
          </button>
          <span className="text-ink-3 font-mono text-[9px]">Changes land on the next edition.</span>
        </div>
      </form>
    </div>
  );
}
