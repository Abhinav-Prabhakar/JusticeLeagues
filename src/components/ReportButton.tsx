import { useEffect, useRef, useState } from "react";
import { Flag, Loader2, X } from "lucide-react";
import { useReportContent } from "../lib/queries";
import type { ReportReason, ReportTarget } from "../lib/types";
import { cn } from "../utils/cn";

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "safety", label: "Safety concern", hint: "Someone may be at risk, including a young neighbour." },
  { value: "harassment", label: "Harassment or hate", hint: "Targeted abuse, threats, or demeaning language." },
  { value: "spam", label: "Spam or advertising", hint: "Not a real offer, need, project, or shift." },
  { value: "misinformation", label: "Misinformation", hint: "Claims or instructions that are plainly wrong." },
  { value: "other", label: "Something else", hint: "Tell the editor in your own words." },
];

/**
 * Reporting is deliberately quiet: a small flag on the item opens a short
 * form, and a report never hides anything by itself. A steward or the editor
 * decides. Reports stay open to every signed-in neighbour, even a restricted
 * account, because safety tools must survive a strike.
 */
export function ReportButton({
  targetType,
  targetId,
  targetTitle,
  signedIn,
  className,
}: {
  targetType: ReportTarget;
  targetId: string;
  targetTitle: string;
  signedIn: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("safety");
  const [detail, setDetail] = useState("");
  const report = useReportContent();
  const firstField = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstField.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!signedIn) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    report.mutate(
      { targetType, targetId, reason, detail: detail.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setDetail("");
          trigger.current?.focus();
        },
      },
    );
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        title="Report this to the editor"
        aria-label={`Report “${targetTitle}”`}
        className={cn(
          "text-ink-3 hover:text-vermilion hover:border-vermilion/60 inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1 font-mono text-[9px] transition-colors",
          className,
        )}
      >
        <Flag size={10} /> Report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`report-title-${targetId}`}
            className="animate-rise border-ink bg-paper w-full max-w-md border-2 p-5 shadow-[7px_7px_0_#14110d]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="kicker text-vermilion flex items-center gap-1.5">
                  <Flag size={11} /> Report to the editor
                </div>
                <h2 id={`report-title-${targetId}`} className="font-display mt-1 text-2xl leading-tight font-black">
                  {targetTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close report form"
                className="border-ink hover:bg-paper-2 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-4">
              <div>
                <label htmlFor={`reason-${targetId}`} className="kicker text-ink-2 mb-1.5 block">
                  What is wrong?
                </label>
                <select
                  ref={firstField}
                  id={`reason-${targetId}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value as ReportReason)}
                  className="form-input"
                >
                  {REASONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-ink-3 mt-1 font-serif text-xs">
                  {REASONS.find((option) => option.value === reason)?.hint}
                </p>
              </div>

              <div>
                <label htmlFor={`detail-${targetId}`} className="kicker text-ink-2 mb-1.5 block">
                  Anything else <span className="text-ink-3 normal-case">(optional)</span>
                </label>
                <textarea
                  id={`detail-${targetId}`}
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="What should the editor know?"
                  className="form-input resize-y"
                />
              </div>

              <p className="text-ink-3 font-serif text-xs">
                Reports are private. One open report per neighbour per item; the editor sees the queue. A young
                neighbour can report without exposing a handle.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={report.isPending}
                  className="btn-press border-ink bg-vermilion text-paper flex items-center gap-2 rounded-full border-2 px-4 py-2.5 font-sans text-[10px] font-extrabold tracking-wider uppercase disabled:opacity-50"
                >
                  {report.isPending ? <Loader2 size={12} className="animate-spin" /> : <Flag size={12} />}
                  Send to the editor
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-ink-3 hover:text-ink font-mono text-[10px] underline underline-offset-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
