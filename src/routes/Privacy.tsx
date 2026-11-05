import { useState } from "react";
import { Link } from "react-router-dom";
import { Database, Download, Lock, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useAuth, useDeleteAccount, useEdition, useExportAccount } from "../lib/queries";
import { handleLabel } from "../lib/api";
import { usePageTitle } from "../lib/usePageTitle";
import { SectionHead } from "../ui";
import { cn } from "../utils/cn";
import { useNavigate } from "react-router-dom";

export default function Privacy() {
  usePageTitle("Privacy & data — The Justice Leagues");

  return (
    <div className="space-y-10 pt-6 pb-14">
      <SectionHead
        level={1}
        kicker="The small print, plainly"
        title={
          <>
            Privacy &amp; <em>your data</em>
          </>
        }
        icon={<Lock size={40} className="text-vermilion" />}
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <Database size={12} /> Local SQLite only
          </span>
        }
      />

      <p className="text-ink-2 max-w-3xl font-serif text-lg">
        The Justice Leagues runs on one machine. There is no hosted database, no analytics, no tracking pixel, and no
        third-party sign-in. What follows is what the paper keeps and the controls you have over it.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          <section aria-labelledby="what-we-keep">
            <h2 id="what-we-keep" className="font-display text-2xl font-black">
              What the paper keeps
            </h2>
            <ul className="text-ink-2 mt-3 space-y-2 font-serif text-sm">
              <li>
                <strong>Account:</strong> display name, handle, email, salted password hash, home chapter, causes, age
                band, and guardian consent where it applies.
              </li>
              <li>
                <strong>Participation:</strong> league memberships, shift signups, filed projects, resource offers and
                claims, badges, and streaks.
              </li>
              <li>
                <strong>The ledger:</strong> points are authored by the server and append-only. The public record shows
                a display name and, for adults, a handle.
              </li>
              <li>
                <strong>Safety records:</strong> reports, strikes, moderation notes, and an audit log of editor
                actions.
              </li>
              <li>
                <strong>Sessions:</strong> an httpOnly cookie tied to a row in the local database. Signing out destroys
                it.
              </li>
            </ul>
          </section>

          <section aria-labelledby="young-neighbours">
            <h2 id="young-neighbours" className="font-display text-2xl font-black">
              Young neighbours
            </h2>
            <div className="border-ink bg-paper-2 mt-3 space-y-2 border-2 p-4 font-serif text-sm">
              <p>
                Nobody opens an account without confirming they are 16 or older. A neighbour under 18 also needs a
                guardian&apos;s consent, recorded at registration.
              </p>
              <p>
                A young neighbour&apos;s handle and email are withheld from every public and admin view. Rosters show
                their display name only, and the editor is told to reach them through their steward. That rule is
                enforced in the server DTOs, not just hidden in the interface.
              </p>
              <p>
                Volunteering may involve photographs. A league must have guardian consent before publishing a photo of
                anyone under 18, and a steward can decline a photo at any time. No image is required to earn points.
              </p>
            </div>
          </section>

          <section aria-labelledby="moderation">
            <h2 id="moderation" className="font-display text-2xl font-black">
              Moderation &amp; strikes
            </h2>
            <div className="border-ink mt-3 border-l-4 pl-4 font-serif text-sm">
              <p className="text-ink-2">
                A neighbour can report a project, resource, shift, league, or member. A steward can hide content in
                their own league; the editor handles the citywide queue. Hiding is not deletion: the item stays on file
                for the audit trail and is simply left out of the edition.
              </p>
              <p id="strikes" className="text-ink-2 mt-2">
                <strong>Strike policy.</strong> Three upheld reports pause posting for 14 days. A paused account can
                still read, join a league, and report — safety tools are never taken away. The editor can restore an
                account early, and every strike carries a note.
              </p>
            </div>
          </section>

          <section aria-labelledby="retention">
            <h2 id="retention" className="font-display text-2xl font-black">
              Deletion &amp; the ledger
            </h2>
            <p className="text-ink-2 mt-3 font-serif text-sm">
              Deleting your account removes your profile, signups, memberships, notifications, and contact details. The
              points ledger is append-only, so those rows lose the person but keep the points: league totals and the
              public record would stop reconciling otherwise. A league you owned passes to its earliest steward. Reports
              you filed stay in the moderation record with your identity removed.
            </p>
          </section>

          <section aria-labelledby="photos">
            <h2 id="photos" className="font-display text-2xl font-black">
              Photos &amp; consent
            </h2>
            <p className="text-ink-2 mt-3 font-serif text-sm">
              Photos are optional. By posting one, you confirm you took it or have permission to publish it, and that
              everyone identifiable has agreed. For anyone under 18, that means a guardian&apos;s written consent held
              by the league. Never include a young neighbour&apos;s address, school, or phone number in a post.
            </p>
          </section>
        </div>

        <YourData />
      </div>

      <div className="border-ink/40 flex flex-wrap items-center justify-between gap-3 border-2 border-dashed px-4 py-3">
        <p className="text-ink-2 font-serif text-sm">
          Questions about a moderation decision? Write to the editor through your steward.
        </p>
        <Link to="/terms" className="kicker text-vermilion hover:text-ink transition-colors">
          Read the house rules
        </Link>
      </div>
    </div>
  );
}

function YourData() {
  const { data } = useEdition();
  const me = data.me;
  const exportAccount = useExportAccount();
  const deleteAccount = useDeleteAccount();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!me) {
    return (
      <aside className="border-ink bg-paper-2 h-fit border-2 p-4 shadow-[5px_5px_0_#14110d]">
        <div className="kicker text-vermilion">Your data</div>
        <h2 className="font-display mt-1 text-xl leading-tight font-black">Sign in to use these controls</h2>
        <p className="text-ink-2 mt-2 font-serif text-sm">
          Export and delete are tied to your account, so they need a session.
        </p>
        <Link
          to="/login?next=%2Fprivacy"
          className="btn-press border-ink bg-ink text-paper mt-4 inline-flex rounded-full border-2 px-4 py-2 font-sans text-[10px] font-extrabold tracking-wider uppercase"
        >
          Sign in
        </Link>
      </aside>
    );
  }

  const remove = () => {
    if (phrase.trim().toLowerCase() !== "delete my account") {
      setError('Type "delete my account" exactly to confirm.');
      return;
    }
    setError(null);
    deleteAccount.mutate(undefined, {
      onSuccess: () => {
        logout.mutate();
        navigate("/", { replace: true });
      },
      onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not delete the account."),
    });
  };

  return (
    <aside className="border-ink bg-paper-2 h-fit border-2 p-4 shadow-[5px_5px_0_#14110d]" aria-label="Your data controls">
      <div className="kicker text-vermilion">Your data</div>
      <h2 className="font-display mt-1 text-xl leading-tight font-black">
        {handleLabel(me.profile)}
      </h2>
      <p className="text-ink-2 mt-1 font-mono text-[10px]">{me.profile.email}</p>

      <button
        type="button"
        onClick={() => exportAccount.mutate()}
        disabled={exportAccount.isPending}
        className="btn-press border-ink bg-paper mt-4 flex w-full items-center justify-center gap-2 rounded-full border-2 px-4 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-50"
      >
        <Download size={13} /> {exportAccount.isPending ? "Packing…" : "Export my data"}
      </button>
      <p className="text-ink-3 mt-1.5 font-serif text-xs">
        One JSON file: profile, memberships, signups, ledger, badges, notifications, and strikes.
      </p>

      <div className="border-ink/20 mt-5 border-t pt-4">
        <div className="kicker text-ink-3 flex items-center gap-1.5 text-[8px]">
          <Trash2 size={11} /> Delete account
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-vermilion hover:text-ink mt-1 font-sans text-xs font-extrabold tracking-wider uppercase underline underline-offset-4"
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-ink-2 flex items-start gap-1.5 font-serif text-xs">
              <TriangleAlert size={13} className="text-vermilion mt-0.5 shrink-0" />
              This cannot be undone. Ledger rows keep their points without your name.
            </p>
            <label htmlFor="delete-phrase" className="kicker text-ink-3 block text-[8px]">
              Type “delete my account”
            </label>
            <input
              id="delete-phrase"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              className="border-ink bg-paper w-full border-2 px-2.5 py-2 font-serif text-sm"
              placeholder="delete my account"
            />
            {error && (
              <p role="alert" className="text-vermilion font-serif text-xs">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={remove}
                disabled={deleteAccount.isPending}
                className={cn(
                  "btn-press border-ink bg-vermilion text-paper rounded-full border-2 px-3 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-50",
                )}
              >
                {deleteAccount.isPending ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setPhrase("");
                  setError(null);
                }}
                className="text-ink-3 hover:text-ink font-mono text-[10px] underline underline-offset-2"
              >
                Keep my account
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-ink-3 mt-5 flex items-start gap-1.5 border-t border-ink/20 pt-3 font-serif text-xs">
        <ShieldCheck size={13} className="text-forest mt-0.5 shrink-0" />
        No data leaves this machine unless you export it.
      </div>
    </aside>
  );
}
