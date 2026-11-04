import { Check, Loader2, Plus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../ctx";
import { activeMembership } from "../lib/api";
import { useEdition, useJoinLeague, useLeaveLeague } from "../lib/queries";
import { cn } from "../utils/cn";

export function JoinButton({
  id,
  variant = "pill",
  className,
}: {
  id: string;
  variant?: "pill" | "round";
  className?: string;
}) {
  const { data } = useEdition();
  const { toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const join = useJoinLeague();
  const leave = useLeaveLeague();

  const league = data.leagues.find((item) => item.id === id);
  const me = data.me;
  const on = Boolean(activeMembership(me, id));
  const pending = join.isPending || leave.isPending;

  const click = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!league) return;

    if (!me) {
      toast("Sign in to join a league");
      navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }

    if (on) leave.mutate(league);
    else join.mutate(league);
  };

  const label = on ? "Leave league" : "Join league";

  if (variant === "round") {
    return (
      <button
        onClick={click}
        disabled={pending}
        aria-label={on ? `${label} ${league?.name ?? ""}` : `Join league ${league?.name ?? ""}`}
        title={on ? "Joined" : "Join"}
        className={cn(
          "border-ink grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 transition-all duration-300 hover:scale-110 disabled:opacity-60",
          on ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-mustard",
          className,
        )}
      >
        <span key={String(on)} className="animate-pop grid place-items-center">
          {pending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : on ? (
            <Check size={16} strokeWidth={3} />
          ) : (
            <Plus size={16} strokeWidth={3} />
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={click}
      disabled={pending}
      aria-pressed={on}
      className={cn(
        "btn-press border-ink flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase disabled:opacity-60",
        on ? "bg-ink text-paper" : "bg-mustard text-ink",
        className,
      )}
    >
      <span key={String(on)} className="animate-pop grid place-items-center">
        {pending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : on ? (
          <Check size={14} strokeWidth={3} />
        ) : (
          <Plus size={14} strokeWidth={3} />
        )}
      </span>
      {on ? "You're in" : "Join league"}
    </button>
  );
}
