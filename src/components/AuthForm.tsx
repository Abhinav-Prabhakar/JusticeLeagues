import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, KeyRound, Loader2, Scale, UserPlus } from "lucide-react";
import { CAUSES, CAUSE_KEYS, type Cause } from "../data";
import { useApp } from "../ctx";
import { api, ApiError, STATIC_PREVIEW, STATIC_PREVIEW_MESSAGE } from "../lib/api";
import { useAuth, useEdition } from "../lib/queries";
import { usePageTitle } from "../lib/usePageTitle";
import { cn } from "../utils/cn";

interface CityPayload {
  city: { id: string; name: string; slug: string } | null;
  neighborhoods: { id: string; name: string; slug: string }[];
}

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  usePageTitle(isRegister ? "Open an account — The Justice Leagues" : "Sign in — The Justice Leagues");

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const { toast } = useApp();
  const { login, register } = useAuth();
  const { data: edition } = useEdition();
  const me = edition.me;

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [causes, setCauses] = useState<Cause[]>([]);
  const [ageBand, setAgeBand] = useState<"adult" | "teen">("adult");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: city } = useQuery({
    queryKey: ["city"],
    queryFn: () => api<CityPayload>("/api/city"),
    staleTime: Infinity,
    enabled: isRegister,
  });

  useEffect(() => {
    if (me) navigate(next, { replace: true });
  }, [me, navigate, next]);

  const pending = login.isPending || register.isPending;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (isRegister) {
        await register.mutateAsync({
          displayName: displayName.trim(),
          email: email.trim(),
          password,
          homeNeighborhood: neighborhood || undefined,
          causes,
          ageConfirmed,
          ageBand,
          guardianConsent: ageBand === "teen" ? guardianConsent : undefined,
        });
      } else {
        await login.mutateAsync({ email: email.trim(), password });
      }
      toast(isRegister ? "Account opened" : "Welcome back");
      navigate(next, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reach the local server. Is it running?");
    }
  };

  return (
    <div className="grid gap-10 pt-8 pb-10 md:pt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      <section className="lg:pt-6">
        <div className="kicker text-vermilion flex items-center gap-1.5">
          <Scale size={13} /> The Justice Leagues
        </div>
        <h1 className="font-display mt-2 text-[clamp(2.6rem,5.5vw,4.4rem)] leading-[0.94] font-black tracking-tight">
          {isRegister ? (
            <>
              Open your <em>desk</em>
            </>
          ) : (
            <>
              Back to your <em>desk</em>
            </>
          )}
        </h1>
        <div className="rule-thick-thin mt-5" />
        <p className="text-ink-2 mt-5 max-w-md font-serif text-lg">
          {isRegister
            ? "One account keeps your leagues, claimed shifts, and Justice Points together. Everything stays on this machine."
            : "Sign in with the local account you opened on this machine. No magic links, no third parties."}
        </p>
        <ul className="mt-6 space-y-2.5">
          {[
            "Points are awarded by the server, never minted in the browser",
            "Your roster survives refresh and restart",
            "Email addresses are never shown publicly",
          ].map((line) => (
            <li key={line} className="text-ink-2 flex items-start gap-2 font-serif text-sm">
              <span className="bg-forest text-paper mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full">
                <Check size={10} strokeWidth={4} />
              </span>
              {line}
            </li>
          ))}
        </ul>
        <div className="border-ink/40 mt-8 border-2 border-dashed p-4">
          <div className="kicker text-ink-3">{isRegister ? "Already on the roster?" : "New to the Leagues?"}</div>
          <Link
            to={`${isRegister ? "/login" : "/register"}?next=${encodeURIComponent(next)}`}
            className="font-display mt-1 inline-flex items-center gap-1.5 text-lg font-bold underline-offset-4 hover:underline"
          >
            {isRegister ? "Sign in instead" : "Open an account"} <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="border-ink bg-paper-2/60 border-2 p-5 shadow-[6px_6px_0_#14110d] sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="bg-ink text-mustard grid h-10 w-10 place-items-center rounded-full">
            {isRegister ? <UserPlus size={18} /> : <KeyRound size={18} />}
          </span>
          <div>
            <div className="kicker text-vermilion">{isRegister ? "New account" : "Returning member"}</div>
            <h2 className="font-display text-2xl leading-none font-black">
              {isRegister ? "Create your account" : "Sign in"}
            </h2>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {STATIC_PREVIEW && (
            <p className="border-ink bg-paper border-l-4 px-3 py-2 font-serif text-sm">
              <strong className="font-sans text-[10px] tracking-wider uppercase">Static edition.</strong>{" "}
              {STATIC_PREVIEW_MESSAGE}
            </p>
          )}

          {isRegister && (
            <Field label="Display name" htmlFor="displayName" hint="Shown on league rosters.">
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                required
                minLength={2}
                maxLength={40}
                className="form-input"
                placeholder="Ada Lovelace"
              />
            </Field>
          )}

          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="form-input"
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Password" htmlFor="password" hint={isRegister ? "At least 10 characters." : undefined}>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 10 : 1}
              className="form-input"
              placeholder="••••••••••"
            />
          </Field>

          {isRegister && (
            <>
              <Field label="Home chapter" htmlFor="neighborhood" hint="Optional — you can join leagues anywhere.">
                <select
                  id="neighborhood"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="form-input"
                >
                  <option value="">No home chapter yet</option>
                  {city?.neighborhoods.map((hood) => (
                    <option key={hood.id} value={hood.id}>
                      {hood.name}
                    </option>
                  ))}
                </select>
              </Field>

              <fieldset>
                <legend className="kicker text-ink-2 mb-2">Causes you care about</legend>
                <div className="flex flex-wrap gap-2">
                  {CAUSE_KEYS.map((key) => {
                    const cause = CAUSES[key];
                    const on = causes.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setCauses((current) =>
                            current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
                          )
                        }
                        className={cn(
                          "border-ink flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase transition-colors",
                          on ? "text-paper" : "bg-paper",
                        )}
                        style={on ? { background: cause.color } : undefined}
                      >
                        <cause.icon size={12} /> {cause.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="border-ink/30 border-t pt-4">
                <legend className="kicker text-ink-2 mb-2">Safeguarding</legend>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 font-serif text-sm">
                    <input
                      type="checkbox"
                      checked={ageConfirmed}
                      onChange={(event) => setAgeConfirmed(event.target.checked)}
                      required
                      className="accent-vermilion mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span>
                      I am 16 or older. <span className="text-ink-3">Nobody opens an account below 16.</span>
                    </span>
                  </label>

                  <div className="flex flex-wrap gap-2 pt-1" role="radiogroup" aria-label="Age band">
                    {[
                      { value: "adult" as const, label: "I'm 18 or older" },
                      { value: "teen" as const, label: "I'm 16 or 17" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={ageBand === option.value}
                        onClick={() => setAgeBand(option.value)}
                        className={cn(
                          "border-ink rounded-full border-2 px-3 py-1.5 font-sans text-[10px] font-extrabold tracking-wider uppercase transition-colors",
                          ageBand === option.value ? "bg-ink text-paper" : "bg-paper hover:bg-paper-2",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {ageBand === "teen" && (
                    <label className="flex items-start gap-2 border-l-2 border-vermilion pl-3 font-serif text-sm">
                      <input
                        type="checkbox"
                        checked={guardianConsent}
                        onChange={(event) => setGuardianConsent(event.target.checked)}
                        required
                        className="accent-vermilion mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span>
                        A parent or guardian consents to this account. Your handle and email stay private; rosters show
                        your name only.
                      </span>
                    </label>
                  )}

                  <p className="text-ink-3 font-serif text-xs">
                    By opening an account you accept the{" "}
                    <Link to="/terms" className="underline underline-offset-2 hover:text-ink">
                      house rules
                    </Link>{" "}
                    and the{" "}
                    <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">
                      data policy
                    </Link>
                    . Photos of anyone under 18 need a guardian&apos;s consent.
                  </p>
                </div>
              </fieldset>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="border-vermilion text-vermilion bg-paper border-l-4 px-3 py-2 font-serif text-sm"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              pending ||
              STATIC_PREVIEW ||
              (isRegister && (!ageConfirmed || (ageBand === "teen" && !guardianConsent)))
            }
            className="btn-press border-ink bg-ink text-paper flex w-full items-center justify-center gap-2 rounded-full border-2 px-5 py-3 font-sans text-xs font-extrabold tracking-wider uppercase disabled:opacity-60"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            {isRegister ? "Open account" : "Sign in"}
          </button>
        </form>

        <p className="text-ink-3 mt-4 font-serif text-xs">
          Accounts are stored in the local SQLite file. Passwords are salted and hashed with scrypt; sessions are
          httpOnly cookies.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="kicker text-ink-2 mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-ink-3 mt-1 font-serif text-xs">{hint}</p>}
    </div>
  );
}
