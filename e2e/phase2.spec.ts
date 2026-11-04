import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "correct horse battery";

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function registerViaApi(context: BrowserContext, name: string, email: string) {
  const response = await context.request.post("/api/auth/register", {
    data: { displayName: name, email, password: PASSWORD, causes: ["climate"], ageConfirmed: true },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function signInAsSteward(page: Page, leagueId: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`steward.${leagueId}.1@justiceleagues.local`);
  await page.getByLabel("Password", { exact: true }).fill("millbrook");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("a full shift takes a waitlist and promotes the first in line", async ({ browser, playwright }) => {
  const baseURL = test.info().project.use.baseURL!;
  const fillers: BrowserContext[] = [];
  const waiterContext = await browser.newContext({ baseURL });

  try {
    // s12 starts 17/20 in the seed. Three neighbours fill it, so the fourth
    // signup has to wait rather than oversell.
    for (let i = 1; i <= 3; i++) {
      const context = await browser.newContext({ baseURL });
      fillers.push(context);
      await registerViaApi(context, `Filler ${i}`, uniqueEmail(`filler-${i}`));
      const signup = await context.request.post("/api/shifts/s12/signup");
      expect(signup.ok(), await signup.text()).toBeTruthy();
    }

    await registerViaApi(waiterContext, "Willa Wait", uniqueEmail("waiter"));
    const waiter = await waiterContext.newPage();
    await waiter.goto("/leagues/harbor/shifts");

    const row = waiter.locator("div.group").filter({ hasText: "Mill River cleanup" });
    await expect(row.getByRole("button", { name: /join waitlist/i })).toBeVisible();

    await row.getByRole("button", { name: /join waitlist/i }).click();
    await expect(row.getByRole("button", { name: /waitlist #1/i })).toBeVisible();
    await expect(waiter.getByText(/waitlisted at #1/i)).toBeVisible();
    await expect(row).toContainText("1 waiting");

    // The record is server-authored, not a browser-only state.
    await waiter.reload();
    await expect(row.getByRole("button", { name: /waitlist #1/i })).toBeVisible();

    // A cancellation opens a seat; the first in line is promoted on the server.
    const cancelled = await fillers[0].request.delete("/api/shifts/s12/signup");
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy();

    await waiter.reload();
    await expect(row.getByRole("button", { name: /^you're in$/i })).toBeVisible();
    await expect(row).not.toContainText("1 waiting");

    const anonymous = await playwright.request.newContext({ baseURL });
    const edition = (await (await anonymous.get("/api/edition")).json()) as {
      shifts: { id: string; filled: number; waitlist: number }[];
    };
    await anonymous.dispose();
    const shift = edition.shifts.find((item) => item.id === "s12")!;
    expect(shift).toMatchObject({ filled: 20, waitlist: 0 });
  } finally {
    // Leave s12 at its seeded 17/20 so a retry starts from the same place.
    for (const context of [waiterContext, ...fillers]) {
      await context.request.delete("/api/shifts/s12/signup").catch(() => undefined);
    }
    for (const context of fillers) await context.close();
    await waiterContext.close();
  }
});

test("a steward renames the league, removes a member, and archives", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL!;
  const memberContext = await browser.newContext({ baseURL });
  const stewardContext = await browser.newContext({ baseURL });

  try {
    await registerViaApi(memberContext, "Removable Neighbour", uniqueEmail("removable"));
    const joined = await memberContext.request.post("/api/leagues/nightlights/join");
    expect(joined.ok(), await joined.text()).toBeTruthy();

    const steward = await stewardContext.newPage();
    steward.setDefaultTimeout(5_000);
    await signInAsSteward(steward, "nightlights");

    await steward.goto("/leagues/nightlights/members");
    const memberRow = steward.locator("li").filter({ hasText: "Removable Neighbour" });
    await expect(memberRow).toBeVisible();
    await memberRow.getByRole("button", { name: /remove removable neighbour from the roster/i }).click();
    await memberRow.getByRole("button", { name: /remove removable neighbour from the roster/i }).click();
    await expect(steward.getByText("Member removed from the roster")).toBeVisible();
    await expect(steward.locator("li").filter({ hasText: "Removable Neighbour" })).toHaveCount(0);

    await steward.goto("/leagues/nightlights/settings");
    await expect(steward.getByRole("heading", { level: 1, name: /night lights/i })).toBeVisible();

    await steward.getByLabel("League name").fill("Nightlights Neighbourhood Watch");
    await steward.getByLabel("Motto").fill("Every porch light is a promise.");
    await steward.getByRole("button", { name: /save the masthead/i }).click();
    await expect(steward.getByText("League settings saved")).toBeVisible();

    await steward.reload();
    await expect(steward.getByLabel("League name")).toHaveValue("Nightlights Neighbourhood Watch");
    await expect(steward.getByLabel("Motto")).toHaveValue("Every porch light is a promise.");

    // Archiving hides the league from the atlas; the owner may do it alone.
    await steward.getByRole("button", { name: /archive league/i }).click();
    await steward.getByRole("button", { name: /confirm archive/i }).click();
    await expect(steward).toHaveURL(/\/leagues$/);
    await expect(steward.getByRole("link", { name: /nightlights neighbourhood watch/i })).toHaveCount(0);

    // Restore the seeded league so a retry starts from the same place.
    const restored = await stewardContext.request.patch("/api/leagues/nightlights/settings", {
      data: {
        name: "Night Lights Patrol",
        motto: "Light every corner.",
        cause: "safety",
        recruiting: true,
        archived: false,
      },
    });
    expect(restored.ok(), await restored.text()).toBeTruthy();
  } finally {
    await memberContext.close();
    await stewardContext.close();
  }
});
