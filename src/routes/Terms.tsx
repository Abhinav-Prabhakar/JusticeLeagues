import { Link } from "react-router-dom";
import { Gavel, Scale, ScrollText, ShieldCheck } from "lucide-react";
import { usePageTitle } from "../lib/usePageTitle";
import { SectionHead } from "../ui";

const RULES = [
  {
    title: "Turn up, or say you cannot",
    body: "A claimed shift is a promise to a neighbour. Cancel early so the waitlist can move. A steward records attendance; a no-show earns nothing and is not a punishment in itself.",
  },
  {
    title: "Points are earned, never minted",
    body: "The server writes every ledger row. The browser cannot send a delta. A reversal is a second, visible row with a reason, not a quiet edit.",
  },
  {
    title: "Post only what you can stand behind",
    body: "Describe a project, offer, or need honestly. Evidence belongs with a project claim. Do not advertise, fundraise for a third party, or post a neighbour's private details.",
  },
  {
    title: "Protect young neighbours",
    body: "Nobody under 18 posts contact details. A guardian consents before an account is opened and before a photo is published. If a young person is at risk, report it to the editor immediately.",
  },
  {
    title: "Disagree without targeting",
    body: "Harassment, threats, and demeaning language are removed. Critique the plan, not the person. Stewards may hide content in their own league; the editor handles the citywide queue.",
  },
  {
    title: "One account, one neighbour",
    body: "Do not impersonate anyone or run multiple accounts to inflate a league. Roles — steward, owner, editor — are granted on the server and can be removed the same way.",
  },
];

export default function Terms() {
  usePageTitle("House rules — The Justice Leagues");

  return (
    <div className="space-y-10 pt-6 pb-14">
      <SectionHead
        kicker="The charter, in practice"
        title={
          <>
            House <em>rules</em>
          </>
        }
        icon={<ScrollText size={40} className="text-vermilion" />}
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <Gavel size={12} /> Three strikes, fourteen days
          </span>
        }
      />

      <p className="text-ink-2 max-w-3xl font-serif text-lg">
        Joining a league is a small civic commitment. These rules keep a city of strangers usable without a moderator
        reading every post. They apply to every league, shift, project, resource, and message on this machine.
      </p>

      <ol className="divide-ink/20 border-ink divide-y-2 border-y-2">
        {RULES.map((rule, index) => (
          <li key={rule.title} className="grid gap-3 px-1 py-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <span className="bg-ink text-mustard grid h-9 w-9 place-items-center rounded-full font-mono text-sm font-bold">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="font-display text-xl leading-tight font-black">{rule.title}</h2>
              <p className="text-ink-2 mt-1 max-w-2xl font-serif text-sm">{rule.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section aria-labelledby="enforcement" className="border-ink bg-paper-2 border-2 p-5">
        <div className="kicker text-vermilion flex items-center gap-1.5">
          <ShieldCheck size={12} /> How enforcement works
        </div>
        <h2 id="enforcement" className="font-display mt-1 text-2xl font-black">
          Report → review → a recorded decision
        </h2>
        <div className="text-ink-2 mt-2 grid gap-3 font-serif text-sm sm:grid-cols-3">
          <p>
            <strong className="font-sans text-[10px] tracking-wider uppercase">1. Report.</strong> Any signed-in
            neighbour can flag an item. One open report per person per item keeps a pile-on from flooding the queue.
          </p>
          <p>
            <strong className="font-sans text-[10px] tracking-wider uppercase">2. Review.</strong> A steward can hide
            content in their league at once. The editor sees every report and can dismiss, hide, or record a strike.
          </p>
          <p>
            <strong className="font-sans text-[10px] tracking-wider uppercase">3. Record.</strong> Every decision writes
            an audit row and notifies the author. Three upheld reports pause posting for 14 days; reading, joining, and
            reporting stay open.
          </p>
        </div>
      </section>

      <section aria-labelledby="appeals">
        <h2 id="appeals" className="font-display text-2xl font-black">
          Appeals and corrections
        </h2>
        <p className="text-ink-2 mt-2 max-w-3xl font-serif text-sm">
          If a decision is wrong, ask your steward to raise it with the editor. A strike can be restored early, and a
          ledger error is corrected with a visible reversal row that names the reason. Nothing is silently rewritten.
        </p>
      </section>

      <div className="border-ink/40 flex flex-wrap items-center justify-between gap-3 border-2 border-dashed px-4 py-3">
        <p className="text-ink-2 font-serif text-sm">Want the data details behind these rules?</p>
        <Link to="/privacy" className="kicker text-vermilion hover:text-ink flex items-center gap-1.5 transition-colors">
          <Scale size={12} /> Privacy &amp; your data
        </Link>
      </div>
    </div>
  );
}
