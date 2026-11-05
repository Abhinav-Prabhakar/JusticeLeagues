import { useState } from "react";
import { Check, ExternalLink, EyeOff, FileText, MapPin, ShieldCheck, Sparkles, X } from "lucide-react";
import { fmt } from "../../data";
import { projectPoints } from "../../data/projects";
import { handleLabel } from "../../lib/api";
import { useLeagueProjects, useReviewProject, useStewardHide } from "../../lib/queries";
import { ReportButton } from "../../components/ReportButton";
import { SectionHead } from "../../ui";
import { cn } from "../../utils/cn";
import { useLeagueContext } from "./context";

const STATUS_STYLE = {
  submitted: "bg-mustard text-ink",
  approved: "bg-forest text-paper",
  rejected: "bg-vermilion text-paper",
} as const;

function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProjectReview() {
  const { league: l } = useLeagueContext();
  const { data, isPending, isError } = useLeagueProjects(l.id);
  const review = useReviewProject();
  const hide = useStewardHide(l.id);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [hideId, setHideId] = useState<string | null>(null);

  const projects = data?.projects ?? [];
  const waiting = projects.filter((project) => project.status === "submitted");
  const reviewed = projects.filter((project) => project.status !== "submitted");

  return (
    <section className="space-y-4">
      <SectionHead
        kicker="The review desk"
        title={
          <>
            Filed <em>projects</em>
          </>
        }
        right={
          <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px]">
            <FileText size={13} /> {isPending ? "…" : `${waiting.length} pending`}
          </span>
        }
      />

      <p className="text-ink-2 max-w-2xl font-serif text-sm">
        Members file finished work with metrics and evidence. Approval writes one ledger row to the submitter and puts
        the project on the public record; rejection writes nothing.
      </p>

      {isPending ? (
        <div role="status" className="border-ink/20 space-y-2 border-y-2 py-4" aria-label="Loading projects">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="border-ink/15 border-2 p-4">
              <div className="bg-paper-3 h-3 w-32 animate-pulse rounded" />
              <div className="bg-paper-3 mt-2 h-4 w-2/3 animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="border-vermilion bg-paper border-l-4 px-4 py-3 font-serif text-sm">
          The project file could not be loaded. The API may still be starting.
        </div>
      ) : projects.length === 0 ? (
        <div className="border-ink/40 grid place-items-center gap-2 border-2 border-dashed px-6 py-10 text-center">
          <ShieldCheck size={22} className="text-ink-3" />
          <p className="font-display text-ink-3 text-lg italic">Nothing on the review desk.</p>
          <p className="text-ink-2 max-w-sm font-serif text-xs">
            Projects filed by members of {l.name} land here for approval.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {waiting.map((project) => {
            const points = projectPoints(project.facts);
            const chapter = l.chapters.find((item) => item.id === project.chapterId);
            const confirming = confirmId === project.id;

            return (
              <article key={project.id} className="border-ink bg-paper border-2">
                <div className="border-ink/15 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase",
                      STATUS_STYLE.submitted,
                    )}
                  >
                    Awaiting review
                  </span>
                  <span className="text-ink-2 flex items-center gap-1 font-mono text-[10px]">
                    <MapPin size={10} /> {chapter?.hood ?? "Citywide"}
                  </span>
                  <span className="text-ink-3 font-mono text-[10px]">{shortDate(project.occurredOn)}</span>
                  <span className="text-ink-3 ml-auto font-mono text-[10px]">
                    {project.submittedBy ? handleLabel(project.submittedBy) : "Unknown member"}
                  </span>
                  {project.submittedBy && (
                    <ReportButton
                      targetType="project"
                      targetId={project.id}
                      targetTitle={project.title}
                      signedIn
                    />
                  )}
                </div>

                <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                  <div>
                    <h3 className="font-display text-xl leading-tight font-black">{project.title}</h3>
                    <p className="text-ink-2 mt-1.5 max-w-2xl font-serif text-sm">{project.summary}</p>
                    <div className="text-ink-2 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px]">
                      <span>{fmt(project.facts.people)} people</span>
                      <span>{fmt(project.facts.hours)} hours</span>
                      <span className="font-semibold">{project.facts.amount}</span>
                      {project.evidenceUrl && (
                        <a
                          href={project.evidenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-vermilion hover:text-ink flex items-center gap-1 underline underline-offset-2"
                        >
                          Evidence <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-stretch gap-2 md:min-w-[178px]">
                    <div className="border-ink bg-paper-2 border-2 px-3 py-2 text-center">
                      <div className="font-display text-2xl leading-none font-black">+{points} JP</div>
                      <div className="kicker text-ink-3 mt-1 text-[8px]">if approved</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirming) {
                          setConfirmId(project.id);
                          return;
                        }
                        setConfirmId(null);
                        review.mutate({ projectId: project.id, decision: "approve" });
                      }}
                      disabled={review.isPending}
                      className={cn(
                        "btn-press rounded-full border-2 px-3 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40",
                        confirming
                          ? "border-ink bg-mustard text-ink"
                          : "border-forest bg-forest text-paper hover:bg-ink hover:border-ink",
                      )}
                    >
                      {review.isPending && confirming ? "Approving…" : confirming ? `Confirm +${points} JP` : "Approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmId(null);
                        review.mutate({ projectId: project.id, decision: "reject" });
                      }}
                      disabled={review.isPending}
                      className="btn-press border-ink/40 text-ink-2 hover:border-ink hover:text-ink rounded-full border-2 px-3 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (hideId !== project.id) {
                          setHideId(project.id);
                          return;
                        }
                        setHideId(null);
                        hide.mutate({
                          targetType: "project",
                          targetId: project.id,
                          note: "Hidden by a steward from the review desk.",
                        });
                      }}
                      disabled={hide.isPending}
                      title="Hide from the edition without deleting the record"
                      className={cn(
                        "btn-press rounded-full border-2 px-3 py-2 font-sans text-[9px] font-extrabold tracking-wider uppercase disabled:opacity-40",
                        hideId === project.id
                          ? "border-vermilion bg-vermilion text-paper"
                          : "border-ink/40 text-ink-2 hover:border-vermilion hover:text-vermilion",
                      )}
                    >
                      <EyeOff size={10} className="mr-1 inline" />
                      {hideId === project.id ? "Confirm hide" : "Hide"}
                    </button>
                    {confirming && (
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="text-ink-3 hover:text-ink font-mono text-[9px] underline underline-offset-2"
                      >
                        Not yet
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {reviewed.length > 0 && (
            <div className="border-ink/20 border-y-2">
              <div className="kicker text-ink-3 flex items-center gap-1.5 px-1 py-2 text-[9px]">
                <Sparkles size={11} /> Review history
              </div>
              <ul className="divide-ink/10 divide-y">
                {reviewed.slice(0, 6).map((project) => (
                  <li key={project.id} className="flex flex-wrap items-center gap-2 px-1 py-2.5">
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[8px] font-extrabold tracking-wider uppercase",
                        STATUS_STYLE[project.status],
                      )}
                    >
                      {project.status === "approved" ? <Check size={9} /> : <X size={9} />}
                      {project.status}
                    </span>
                    <span className="font-display min-w-0 flex-1 truncate text-sm font-bold">{project.title}</span>
                    <span className="text-ink-3 font-mono text-[9px]">
                      {project.status === "approved" ? `+${fmt(project.points)} JP` : "no points"}
                      {project.reviewedAt ? ` · ${shortDate(project.reviewedAt.slice(0, 10))}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
