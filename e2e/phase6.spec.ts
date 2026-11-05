import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "correct horse battery";
const EDITOR = "admin@justiceleagues.local";

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
}

async function registerViaApi(context: { request: BrowserContext["request"] }, name: string, email: string) {
  const response = await context.request.post("/api/auth/register", {
    data: { displayName: name, email, password: PASSWORD, causes: ["climate"], ageConfirmed: true },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { me: { profile: { id: string } } };
}

async function signInAsEditor(page: Page) {
  const response = await page.context().request.post("/api/auth/login", {
    data: { email: EDITOR, password: "millbrook" },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("the health endpoint is the operator's first glance", async ({ request }) => {
  const response = await request.get("/api/health", { headers: { "x-request-id": "e2e-health-check" } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const health = (await response.json()) as {
    ok: boolean;
    service: string;
    storage: string;
    requestId: string;
    database: { migrations: number; bytes: number; walBytes: number };
    backup: { count: number; latestAt: string | null; ageHours: number | null };
    uptimeSeconds: number;
    node: string;
  };

  expect(health.ok).toBe(true);
  expect(health.service).toBe("justice-leagues");
  expect(health.storage).toBe("sqlite");
  expect(health.requestId).toBe("e2e-health-check");
  expect(response.headers()["x-request-id"]).toBe("e2e-health-check");
  expect(health.database.migrations).toBeGreaterThanOrEqual(11);
  expect(health.database.bytes).toBeGreaterThan(0);
  expect(health.database.walBytes).toBeGreaterThanOrEqual(0);
  expect(health.backup.count).toBeGreaterThanOrEqual(0);
  expect(health.uptimeSeconds).toBeGreaterThan(0);
  expect(health.node).toMatch(/^v\d+/);
});

test("the editor files a pilot note and closes a crash report", async ({ page }) => {
  const message = `E2E crash ${Date.now()}`;
  const crash = await page.request.post("/api/errors", {
    data: {
      message,
      component: "at LeagueHeader (e2e)",
      path: "/leagues/harbor",
      stack: "TypeError: e2e crash\n    at LeagueHeader",
    },
  });
  expect(crash.status(), await crash.text()).toBe(201);

  await signInAsEditor(page);
  await page.goto("/admin?tab=pulse");

  await expect(page.getByRole("button", { name: /^pulse$/i })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 3, name: /^the funnel$/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /^press health$/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /leagues carrying the edition/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /^the crash desk$/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /^pilot notes$/i })).toBeVisible();

  const crashRow = page.locator("li").filter({ hasText: message });
  await expect(crashRow).toBeVisible();
  await crashRow.getByRole("button", { name: `Close crash report: ${message}` }).click();
  await expect(crashRow).toHaveCount(0);

  const note = `E2E pilot note ${Date.now()}`;
  await page.getByLabel(/what did the pilot teach us this week/i).fill(note);
  await page.getByLabel("Note kind").selectOption("friction");
  await page.getByLabel("League", { exact: true }).selectOption("harbor");
  await page.getByRole("button", { name: /^file note$/i }).click();
  await expect(page.getByText(note)).toBeVisible();
});

test("a page view reaches the private funnel and the front page meets the LCP budget", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { lcp: 0 };
    (window as unknown as { __lcpState: typeof state }).__lcpState = state;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.lcp = Math.max(state.lcp, entry.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Justice");
  const hero = page.locator("main img").first();
  await expect(hero).toHaveAttribute("fetchpriority", "high");
  await expect(hero).toHaveAttribute("loading", "eager");

  const lcp = await page.evaluate(() => (window as unknown as { __lcpState?: { lcp: number } }).__lcpState?.lcp ?? 0);
  expect(lcp, "largest contentful paint in ms").toBeGreaterThan(0);
  expect(lcp, "largest contentful paint in ms").toBeLessThan(2_500);

  const leagueView = page.waitForResponse(
    (response) => response.url().endsWith("/api/pulse") && response.request().method() === "POST",
  );
  await page.goto("/leagues/harbor");
  expect((await leagueView).status()).toBe(202);

  await signInAsEditor(page);
  const pulse = await page.context().request.get("/api/admin/pulse?days=7");
  expect(pulse.ok(), await pulse.text()).toBeTruthy();
  const body = (await pulse.json()) as {
    homeViews: number;
    funnel: { key: string; count: number }[];
    liquidity: { capacity: number; openSpots: number };
    reliability: { showUpRate: number };
    integrity: { ledgerRows: number };
  };
  expect(body.homeViews).toBeGreaterThanOrEqual(1);
  expect(body.funnel.find((stage) => stage.key === "league_view")?.count ?? 0).toBeGreaterThanOrEqual(1);
  expect(body.liquidity.capacity).toBeGreaterThan(0);
  expect(body.integrity.ledgerRows).toBeGreaterThan(0);
});

test("the eight north-star actions work on one continuous record", async ({ browser, playwright }) => {
  const baseURL = test.info().project.use.baseURL!;
  const memberContext = await playwright.request.newContext({ baseURL });
  const stewardContext = await playwright.request.newContext({ baseURL });

  try {
    const member = await registerViaApi(
      { request: memberContext },
      "North Star Neighbour",
      uniqueEmail("north-star"),
    );
    const profileId = member.me.profile.id;

    const stewardLogin = await stewardContext.post("/api/auth/login", {
      data: { email: "steward.harbor.1@justiceleagues.local", password: "millbrook" },
    });
    expect(stewardLogin.ok(), await stewardLogin.text()).toBeTruthy();

    // 1. Find a league for a cause nearby.
    const found = await memberContext.get("/api/search?q=harbor&lat=43.6532&lng=-79.3832&radiusKm=50");
    expect(found.ok(), await found.text()).toBeTruthy();
    const search = (await found.json()) as { results: { slug: string; distanceKm: number | null }[] };
    expect(search.results.some((league) => league.slug === "harbor" && (league.distanceKm ?? 99) <= 50)).toBe(true);

    // 2. Join it and see the next shift.
    const joined = await memberContext.post("/api/leagues/harbor/join");
    expect(joined.ok(), await joined.text()).toBeTruthy();
    expect(((await joined.json()) as { joined: boolean }).joined).toBe(true);

    // 3a. A steward publishes a shift and fills it.
    const title = `North-star drain sweep ${Date.now()}`;
    const published = await stewardContext.post("/api/leagues/harbor/shifts", {
      data: {
        chapterId: "ch_harbor",
        title,
        day: 3,
        time: "09:30",
        duration: "2h",
        capacity: 4,
        place: "Dock 4",
        bring: ["gloves"],
      },
    });
    expect(published.status(), await published.text()).toBe(201);
    const shift = (await published.json()) as { id: string; filled: number; spots: number };

    // 3b. The neighbour claims a spot.
    const signup = await memberContext.post(`/api/shifts/${shift.id}/signup`);
    expect(signup.ok(), await signup.text()).toBeTruthy();
    expect(((await signup.json()) as { status: string }).status).toBe("signed_up");

    // 4. They show up, the steward checks them in, and points land.
    const checkedIn = await stewardContext.post(`/api/shifts/${shift.id}/check-in`, {
      data: { profileId, status: "attended" },
    });
    expect(checkedIn.ok(), await checkedIn.text()).toBeTruthy();
    expect(((await checkedIn.json()) as { awarded: number }).awarded).toBeGreaterThan(0);

    const me = (await (await memberContext.get("/api/auth/me")).json()) as {
      me: { points: number; signups: { status: string }[] };
    };
    expect(me.me.points).toBeGreaterThanOrEqual(49);
    expect(me.me.signups.some((item) => item.status === "attended")).toBe(true);

    // 4b. The steward can see who is active on the shift.
    const roster = (await (await stewardContext.get(`/api/shifts/${shift.id}/roster`)).json()) as {
      entries: { profile: { id: string }; status: string }[];
    };
    expect(roster.entries.some((entry) => entry.profile.id === profileId && entry.status === "attended")).toBe(true);

    // 5. The league's collective impact and rank move on the public record.
    const impact = (await (await memberContext.get("/api/leagues/harbor/impact")).json()) as {
      totals: { points: number; hours: number };
    };
    expect(impact.totals.points).toBeGreaterThan(0);

    const standings = (await (await memberContext.get("/api/standings?scope=global&limit=50")).json()) as {
      rows: { leagueId: string; rank: number; points: number }[];
    };
    const harbor = standings.rows.find((row) => row.leagueId === "harbor");
    expect(harbor?.rank).toBeGreaterThanOrEqual(1);
    expect(harbor?.points).toBeGreaterThan(0);

    // 6. A steward posts a resource need; a neighbour claims it; the handoff closes.
    const resourceTitle = `North-star van lift ${Date.now()}`;
    const posted = await stewardContext.post("/api/leagues/harbor/resources", {
      data: {
        chapterId: "ch_harbor",
        kind: "want",
        title: resourceTitle,
        description: "A van and two hands for the Saturday river haul.",
        quantity: "One afternoon",
      },
    });
    expect(posted.status(), await posted.text()).toBe(201);
    const resource = (await posted.json()) as { id: string };

    const claimed = await memberContext.post(`/api/resources/${resource.id}/claim`);
    expect(claimed.ok(), await claimed.text()).toBeTruthy();
    expect(((await claimed.json()) as { status: string }).status).toBe("claimed");

    const fulfilled = await memberContext.post(`/api/resources/${resource.id}/fulfil`);
    expect(fulfilled.ok(), await fulfilled.text()).toBeTruthy();
    expect(((await fulfilled.json()) as { status: string }).status).toBe("fulfilled");

    // 7. A filed project with evidence becomes a public win only after approval.
    const projectTitle = `North-star lantern sweep ${Date.now()}`;
    const filed = await memberContext.post("/api/leagues/harbor/projects", {
      data: {
        chapterId: "ch_harbor",
        title: projectTitle,
        summary: "Eleven neighbours repaired and repainted the lanterns along the east walk.",
        occurredOn: new Date().toISOString().slice(0, 10),
        people: 11,
        hours: 22,
        amount: "0",
        evidenceUrl: "https://example.org/lanterns",
      },
    });
    expect(filed.status(), await filed.text()).toBe(201);
    const project = (await filed.json()) as { id: string; status: string; points: number };
    expect(project.status).toBe("submitted");
    expect(project.points).toBe(0);

    const approved = await stewardContext.post(`/api/projects/${project.id}/review`, {
      data: { decision: "approve" },
    });
    expect(approved.ok(), await approved.text()).toBeTruthy();
    const decision = (await approved.json()) as { status: string; points: number };
    expect(decision.status).toBe("approved");
    expect(decision.points).toBeGreaterThan(0);

    // 8. The record the public sees is the one the server wrote.
    const context = await browser.newContext({ baseURL });
    try {
      const page = await context.newPage();
      await page.goto("/leagues/harbor/impact");
      await expect(page.getByText(projectTitle).first()).toBeVisible();
    } finally {
      await context.close();
    }
  } finally {
    await memberContext.dispose();
    await stewardContext.dispose();
  }
});
