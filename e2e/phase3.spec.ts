import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "correct horse battery";

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function signInAsSteward(page: Page, leagueId: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`steward.${leagueId}.1@justiceleagues.local`);
  await page.getByLabel("Password", { exact: true }).fill("millbrook");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("the public ledger lists entries and filters by league", async ({ page }) => {
  await page.goto("/ledger");

  await expect(page.getByRole("heading", { level: 1, name: /every justice point award/i })).toBeAttached();
  await expect(page.getByRole("heading", { level: 2, name: /every point/i })).toBeVisible();
  await expect(page.getByText(/server-authored/i).first()).toBeVisible();

  const rows = page.locator("main ol > li");
  await expect(rows.first()).toBeVisible();
  const allEntries = await rows.count();
  expect(allEntries).toBeGreaterThan(0);

  await page.locator("main select").first().selectOption({ label: "Harbor Cleanup Coalition" });
  await expect(page.locator("main ol > li").first()).toBeVisible();
  await expect(page.locator("main ol").getByRole("link", { name: "Harbor Cleanup Coalition" }).first()).toBeVisible();
  expect(await page.locator("main ol > li").count()).toBeLessThanOrEqual(allEntries);
  await expect(page.locator("main ol").getByText("Eastside Neighborhood Watch")).toHaveCount(0);
});

test("the homepage standings switch between server ledger scopes", async ({ page }) => {
  await page.goto("/");

  const standings = page.locator("aside").filter({ hasText: "The Standings" });
  await expect(standings.getByText(/server-ranked leaderboard/i)).toBeVisible();

  const monthTab = standings.getByRole("button", { name: "Month", exact: true });
  await monthTab.click();
  await expect(monthTab).toHaveAttribute("aria-pressed", "true");
  await expect(standings.locator("ol > li").first()).toBeVisible();

  const chaptersTab = standings.getByRole("button", { name: "Chapters", exact: true });
  await chaptersTab.click();
  await expect(chaptersTab).toHaveAttribute("aria-pressed", "true");
  await expect(standings.getByText(/points earned in each neighbourhood chapter/i)).toBeVisible();

  await standings.getByRole("button", { name: "Global", exact: true }).click();
  await expect(standings.getByText(/ledger totals/i)).toBeVisible();
});

test("a steward sees the review desk and the badge shelf", async ({ page }) => {
  await signInAsSteward(page, "harbor");

  await expect(page.getByRole("heading", { level: 2, name: /badges/i })).toBeVisible();
  await expect(page.getByText("Charter steward")).toBeVisible();
  await expect(page.getByText(/weeks on/i).first()).toBeVisible();

  await page.goto("/leagues/harbor/steward");
  await expect(page.getByRole("heading", { level: 3, name: /review queue/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /recent ledger entries/i })).toBeVisible();
});

test("a new member's join appears in the public ledger", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({ baseURL });

  try {
    const email = uniqueEmail("ledger-reader");
    const registered = await context.request.post("/api/auth/register", {
      data: { displayName: "Ledger Reader", email, password: PASSWORD, causes: ["climate"], ageConfirmed: true },
    });
    expect(registered.ok(), await registered.text()).toBeTruthy();
    const me = (await registered.json()) as { me: { profile: { handle: string } } };

    const joined = await context.request.post("/api/leagues/harbor/join");
    expect(joined.ok(), await joined.text()).toBeTruthy();

    const page = await context.newPage();
    await page.goto("/ledger");
    await expect(page.getByText(`@${me.me.profile.handle}`).first()).toBeVisible();
    await expect(page.locator("main ol").getByText(/charter signings/i).first()).toBeVisible();
  } finally {
    await context.close();
  }
});
