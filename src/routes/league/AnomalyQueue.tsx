import { useState } from "react";
import { AlertTriangle, ArrowDownRight, CheckCheck, RotateCcw, ShieldQuestion } from "lucide-react";
import { fmt } from "../../data";
import { handleLabel } from "../../lib/api";
import { useAnomalies, usePublicLedger, useResolveAnomaly, useReverseLedgerEntry } from "../../lib/queries";
import type { AnomalyDTO } from "../../lib/types";
import { cn } from "../../utils/cn";

const SEVERITY_STYLE: Record<AnomalyDTO["severity"], string> = {
  watch: "bg-paper-3 text-ink-2",
  review: "bg-mustard text-ink",
  severe: "bg-vermilion text-paper",
};

const CATEGORY_LABEL: Record<string, string> = {
  large_award: "Large single award",
  project_without_evidence: "Project without evidence",
  daily_points: "Daily points watch",
  weekly_hours: "Weekly hours watch",
  daily_checkins: "Daily check-ins watch",
  steward_reversal: "Steward reversal",
};

function categoryLabel(key: string): string {
  return CATEGORY_LABEL[key] ?? key.replace(/_/g, " ");
}

function dayStamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The steward's review desk. Nothing here blocks an award — it surfaces the
 * ones that deserve a second look and lets a steward reverse the ledger entry
 * with an auditable note. A reversal appends a correction; it never edits.
 */
export function AnomalyQueue({ leagueId }: { leagueId: string }) {
  const { data, isPending } = useAnomalies(leagueId);
  const resolve = useResolveAnomaly(leagueId);
  const reverse = useReverseLedgerEntry(leagueId);
  const ledger = usePublicLedger({ leagueId, limit: 8, liveOnly: true });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmReverse, setConfirmReverse] = useState<string | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<string | null>(null);

  const anomalies = data?.anomalies ?? [];
  const open = anomalies.filter((anomaly) => anomaly.status === "open");
  const resolved = anomalies.filter((anomaly) => anomaly.status !== "open");

  return (
    <div className="space-y-8">
      <section aria-labelledby="review-queue">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 id="review-queue" className="font-display flex items-center gap-2 text-2xl leading-none font-black italic">
            <ShieldQuestion size={20} className="text-vermilion" /> Review queue
          </h3>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-sans text-[9px] font-extrabold tracking-wider uppercase",
              open.length > 0 ? "bg-vermilion text-paper" : "bg-forest text-paper",
            )}
          >
            {open.length > 0 ? `${open.length} open` : "Clear"}
          </span>
          <span className="text-ink-3 ml-auto font-mono text-[10px]">
            Flags only · a steward decides, the ledger records
          </span>
        </div>

        {isPending ? (
          <div className="border-ink/20 grid gap-2 border-2 border-dashed p-4">
            <div className="bg-paper-3 h-3 w-2/3 animate-pulse rounded" />
            <div className="bg-paper-3 h-3 w-1/2 animate-pulse rounded" />
          </div>
        ) : anomalies.length === 0 ? (
          <div className="border-ink/40 flex items-center gap-3 border-2 border-dashed px-4 py-6">
            <CheckCheck size={20} className="text-forest shrink-0" />
            <p className="text-ink-2 font-serif text-sm">
              Nothing on the desk. Awards that clear the soft caps — or land without evidence — show up here
              automatically.
            </p>
          </div>
        ) : (
          <ol className="divide-ink/20 border-ink divide-y-2 border-y-2">
            {[...open, ...resolved].map((anomaly) => {
              const isOpen = anomaly.status === "open";
              const pendingThis = resolve.isPending && resolve.variables?.anomalyId === anomaly.id;
              return (
                <li key={anomaly.id} className={cn("px-1 py-3.5", !isOpen && "opacity-60")}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase",
                        SEVERITY_STYLE[anomaly.severity],
                      )}
                    >
                      {anomaly.severity}
                    </span>
                    <span className="font-display text-base font-bold">{categoryLabel(anomaly.category)}</span>
                    {anomaly.delta !== null && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5 font-mono text-[11px] font-semibold",
                          anomaly.delta < 0 ? "text-vermilion" : "text-forest",
                        )}
                      >
                        <ArrowDownRight size={11} className={anomaly.delta > 0 ? "rotate-180" : ""} />
                        {fmt(anomaly.delta)} JP
                      </span>
                    )}
                    <span className="text-ink-3 ml-auto font-mono text-[9px]">{dayStamp(anomaly.createdAt)}</span>
                  </div>
                  <p className="text-ink-2 mt-1 font-serif text-sm">{anomaly.detail}</p>
                  <div className="text-ink-3 mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[10px]">
                    {anomaly.profile ? <span>{handleLabel(anomaly.profile)}</span> : <span>No profile</span>}
                    {!isOpen && (
                      <span className="text-forest">
                        {anomaly.status}
                        {anomaly.resolutionNote ? ` · ${anomaly.resolutionNote}` : ""}
                      </span>
                    )}
                  </div>

                  {isOpen && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        value={notes[anomaly.id] ?? ""}
                        onChange={(event) => setNotes({ ...notes, [anomaly.id]: event.target.value })}
                        maxLength={300}
                        placeholder="Note for the record (optional)"
                        aria-label={`Resolution note for ${categoryLabel(anomaly.category)}`}
                        className="border-ink bg-paper min-w-0 flex-1 border-2 px-2.5 py-1.5 font-sans text-xs"
                      />
                      <button
                        type="button"
                        disabled={resolve.isPending}
                        onClick={() =>
                          resolve.mutate({ anomalyId: anomaly.id, decision: "clear", note: notes[anomaly.id] ?? "" })
                        }
                        className="btn-press border-ink bg-paper flex items-center gap-1 rounded-full border-2 px-3 py-1.5 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
                      >
                        <CheckCheck size={10} /> {pendingThis ? "Saving" : "Clear"}
                      </button>
                      <button
                        type="button"
                        disabled={resolve.isPending || !anomaly.ledgerId}
                        onClick={() => {
                          if (confirmReverse !== anomaly.id) {
                            setConfirmReverse(anomaly.id);
                            return;
                          }
                          setConfirmReverse(null);
                          resolve.mutate({
                            anomalyId: anomaly.id,
                            decision: "reverse",
                            note: notes[anomaly.id] ?? "",
                          });
                        }}
                        className={cn(
                          "btn-press flex items-center gap-1 rounded-full border-2 px-3 py-1.5 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40",
                          confirmReverse === anomaly.id
                            ? "border-vermilion bg-vermilion text-paper"
                            : "border-vermilion/50 text-vermilion",
                        )}
                      >
                        <RotateCcw size={10} />
                        {confirmReverse === anomaly.id ? "Confirm reversal" : "Reverse entry"}
                      </button>
                      {!anomaly.ledgerId && (
                        <span className="text-ink-3 font-mono text-[9px]">No ledger entry attached</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="recent-ledger">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 id="recent-ledger" className="font-display flex items-center gap-2 text-2xl leading-none font-black italic">
            <AlertTriangle size={20} className="text-mustard" /> Recent ledger entries
          </h3>
          <span className="text-ink-3 ml-auto font-mono text-[10px]">
            A reversal appends a negative row — nothing is rewritten
          </span>
        </div>
        {(ledger.data?.entries ?? []).length === 0 ? (
          <p className="text-ink-3 font-serif text-sm">No live entries yet.</p>
        ) : (
          <ol className="divide-ink/20 border-ink divide-y-2 border-y-2">
            {(ledger.data?.entries ?? []).map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="text-ink-3 w-16 shrink-0 font-mono text-[9px] tracking-wider uppercase">
                  {dayStamp(entry.createdAt)}
                </span>
                <span
                  className={cn(
                    "w-16 shrink-0 font-mono text-[11px] font-semibold tabular-nums",
                    entry.delta < 0 ? "text-vermilion" : "text-forest",
                  )}
                >
                  {entry.delta > 0 ? "+" : ""}
                  {fmt(entry.delta)}
                </span>
                <span className="min-w-0 flex-1 truncate font-serif text-sm">{entry.reason}</span>
                <span className="text-ink-3 font-mono text-[10px]">
                  {entry.profile ? handleLabel(entry.profile) : "Imported"}
                </span>
                <button
                  type="button"
                  disabled={entry.refType === "reversal" || entry.refType === "sealed_history" || reverse.isPending}
                  onClick={() => {
                    if (entry.refType === "sealed_history") return;
                    if (confirmEntry !== entry.id) {
                      setConfirmEntry(entry.id);
                      return;
                    }
                    setConfirmEntry(null);
                    reverse.mutate({ entryId: entry.id, note: "Reversed from the steward desk." });
                  }}
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase disabled:opacity-30",
                    confirmEntry === entry.id
                      ? "border-vermilion bg-vermilion text-paper"
                      : "border-ink/40 text-ink-2 hover:border-vermilion hover:text-vermilion",
                  )}
                >
                  {entry.refType === "sealed_history" ? "Imported" : confirmEntry === entry.id ? "Confirm" : "Reverse"}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
