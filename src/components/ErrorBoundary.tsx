import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Local-only: keep the trace in the console for now. Phase 6 adds reporting.
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="bg-paper grid min-h-screen place-items-center px-6">
        <div className="border-ink bg-paper-2 w-full max-w-lg border-2 p-8 shadow-[8px_8px_0_#14110d]">
          <div className="mb-5 flex items-center gap-3">
            <span className="bg-vermilion text-paper grid h-11 w-11 place-items-center rounded-full">
              <AlertTriangle size={20} />
            </span>
            <div>
              <div className="kicker text-vermilion">Stop the presses</div>
              <h1 className="font-display text-3xl leading-none font-black">This page fell over</h1>
            </div>
          </div>
          <p className="text-ink-2 font-serif">
            Something broke while rendering. Your data is untouched — this build has no server writes yet.
          </p>
          <pre className="border-ink/30 bg-paper text-ink-2 mt-4 max-h-32 overflow-auto border p-3 font-mono text-[11px]">
            {error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="btn-press border-ink bg-mustard mt-6 flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-sans text-xs font-extrabold tracking-wider uppercase"
          >
            <RotateCcw size={14} /> Reload the edition
          </button>
        </div>
      </div>
    );
  }
}
