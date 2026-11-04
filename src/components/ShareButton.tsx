import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { cn } from "../utils/cn";

/** Copy the current route, or hand it to the OS share sheet on mobile. */
export function ShareButton({ className, label = "Share" }: { className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch {
        // The reader dismissed the sheet, or it is unavailable: fall through.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        "border-ink bg-paper hover:bg-mustard inline-flex items-center gap-1.5 border-2 px-2.5 py-1 font-sans text-[9px] font-extrabold tracking-wider uppercase transition-colors",
        className,
      )}
    >
      {copied ? <Check size={12} /> : <Share2 size={12} />}
      {copied ? "Link copied" : label}
    </button>
  );
}
