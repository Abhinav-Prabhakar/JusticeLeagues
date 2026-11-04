import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = "The Justice Leagues — Organised neighbours. Measured impact.";
    };
  }, [title]);
}
