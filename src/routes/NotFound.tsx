import { Link } from "react-router-dom";
import { ArrowLeft, Compass, SearchX } from "lucide-react";
import { usePageTitle } from "../lib/usePageTitle";

export function NotFound() {
  usePageTitle("Page not found — The Justice Leagues");

  return (
    <div className="grid min-h-[60vh] place-items-center py-16">
      <div className="w-full max-w-xl text-center">
        <div className="border-ink bg-mustard mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border-2">
          <SearchX size={28} strokeWidth={2.2} />
        </div>
        <div className="kicker text-vermilion">Off the printed page</div>
        <h1 className="font-display mt-1 text-7xl leading-none font-black tracking-tight">404</h1>
        <p className="text-ink-2 mx-auto mt-4 max-w-sm font-serif text-lg">
          This story never made it past the copy desk. The atlas is still where you left it.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="btn-press border-ink bg-vermilion text-paper flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
          >
            <ArrowLeft size={14} /> Front page
          </Link>
          <Link
            to="/leagues"
            className="btn-press border-ink bg-paper flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
          >
            <Compass size={14} /> The Atlas
          </Link>
        </div>
      </div>
    </div>
  );
}
