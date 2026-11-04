/* eslint-disable react-refresh/only-export-components -- the provider and its hook intentionally live together */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Sparkles } from "lucide-react";
import type { Cause } from "./data";

type Filter = Cause | "all";

interface State {
  cause: Filter;
  setCause: (c: Filter) => void;
  openLeague: string | null;
  setOpenLeague: (id: string | null) => void;
  toast: (msg: string, jp?: number) => void;
}

const Ctx = createContext<State>(null as unknown as State);
export const useApp = () => useContext(Ctx);

/** UI chrome only: filters, the legacy drawer, and toasts. Domain data is in the API. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [cause, setCause] = useState<Filter>("all");
  const [openLeague, setOpenLeague] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; jp?: number; k: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((text: string, jp?: number) => {
    setMsg({ text, jp, k: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2800);
  }, []);

  useEffect(() => {
    document.body.style.overflow = openLeague ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [openLeague]);

  return (
    <Ctx.Provider value={{ cause, setCause, openLeague, setOpenLeague, toast }}>
      {children}
      {msg && (
        <div
          key={msg.k}
          className="border-ink bg-ink text-paper fixed bottom-6 left-1/2 z-[100] flex items-center gap-3 rounded-full border-2 py-2.5 pr-5 pl-3 shadow-[4px_4px_0_#f2b705]"
          style={{ animation: "toast-in .4s cubic-bezier(.2,.9,.3,1.1) both" }}
          role="status"
          aria-live="polite"
        >
          <span className="bg-mustard text-ink grid h-7 w-7 place-items-center rounded-full">
            <Check size={15} strokeWidth={3} />
          </span>
          <span className="font-sans text-sm font-semibold">{msg.text}</span>
          {msg.jp && (
            <span className="text-mustard flex items-center gap-1 font-mono text-xs font-semibold">
              <Sparkles size={12} /> +{msg.jp}
            </span>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
