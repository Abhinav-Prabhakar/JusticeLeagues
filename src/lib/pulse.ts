import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { STATIC_PREVIEW } from "./api";
import type { PulseEventName } from "./types";

/**
 * The funnel's top half. Only an allowlisted page name leaves the browser;
 * there is no identifier, fingerprint, IP, or cookie in the payload. The
 * server records the same event with the signed-in profile when there is one.
 */
function pageEvent(pathname: string): PulseEventName | null {
  if (pathname === "/") return "home_view";
  if (pathname === "/leagues") return "atlas_view";
  if (/^\/leagues\/[^/]+\/chapters\/[^/]+$/.test(pathname)) return "chapter_view";
  if (/^\/leagues\/[^/]+$/.test(pathname)) return "league_view";
  if (pathname === "/ledger") return "ledger_view";
  if (pathname === "/register") return "register_view";
  return null;
}

// StrictMode mounts effects twice in development; one event per page is enough.
const seen = new Set<string>();

export function usePagePulse(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    if (STATIC_PREVIEW) return;
    const name = pageEvent(pathname);
    if (!name) return;
    const key = `${name}:${pathname}`;
    if (seen.has(key)) return;
    seen.add(key);

    void fetch("/api/pulse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, path: pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);
}
