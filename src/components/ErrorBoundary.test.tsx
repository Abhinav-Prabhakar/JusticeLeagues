import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("press jam");
}

describe("ErrorBoundary", () => {
  it("shows an editorial fallback instead of a blank page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: /this page fell over/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload the edition/i })).toBeInTheDocument();
    expect(screen.getByText("press jam")).toBeInTheDocument();
  });
});
