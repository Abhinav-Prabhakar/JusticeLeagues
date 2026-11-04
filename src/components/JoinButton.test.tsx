import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../ctx";
import { initialEdition } from "../lib/api";
import type { EditionDTO } from "../lib/types";
import { JoinButton } from "./JoinButton";

function LoginProbe() {
  const location = useLocation();
  return <div>login {location.search}</div>;
}

function renderButton(edition: EditionDTO) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["edition"], edition);

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/leagues/harbor"]}>
        <AppProvider>
          <Routes>
            <Route path="/leagues/:id" element={<JoinButton id="harbor" />} />
            <Route path="/login" element={<LoginProbe />} />
          </Routes>
        </AppProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("JoinButton", () => {
  it("sends signed-out visitors to sign in and remembers where they were", async () => {
    const user = userEvent.setup();
    renderButton(initialEdition());

    await user.click(screen.getByRole("button", { name: /join league/i }));

    expect(screen.getByText(/login \?next=%2Fleagues%2Fharbor/)).toBeInTheDocument();
  });

  it("shows membership for a signed-in member", () => {
    const edition = initialEdition();
    const me = {
      profile: {
        id: "usr_1",
        handle: "ada",
        displayName: "Ada",
        email: "ada@example.com",
        bio: "",
        homeNeighborhood: null,
        causes: [],
        role: "member" as const,
        ageBand: "adult" as const,
        restrictedUntil: null,
        createdAt: new Date().toISOString(),
      },
      memberships: [
        {
          leagueId: "harbor",
          chapterId: "ch_harbor",
          role: "member" as const,
          status: "active" as const,
          joinedAt: new Date().toISOString(),
          points: 25,
        },
      ],
      signups: [],
      points: 25,
      ledger: [],
      badges: [],
      streak: { current: 0, longest: 0, weekActive: false },
      unread: 0,
    };
    edition.me = me;

    renderButton(edition);

    expect(screen.getByRole("button", { name: /you're in/i })).toHaveTextContent("You're in");
  });
});
