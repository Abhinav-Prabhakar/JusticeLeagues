import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "correct horse battery";

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function registerViaUi(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /open account/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: /your desk/i })).toBeVisible();
}

async function registerViaApi(context: BrowserContext, name: string, email: string) {
  const response = await context.request.post("/api/auth/register", {
    data: { displayName: name, email, password: PASSWORD, causes: ["climate"] },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("an account, its membership, and its shift survive sign-out and sign-in", async ({ page }) => {
  const email = uniqueEmail("ada");

  await registerViaUi(page, "Ada Lovelace", email);

  // Join a league through the real button.
  await page.goto("/leagues/harbor");
  await expect(page.getByRole("heading", { level: 1, name: /harbor cleanup coalition/i })).toBeVisible();
  await page.getByRole("button", { name: /^join league$/i }).click();
  await expect(page.getByRole("button", { name: /^you're in$/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /your justice points: 25/i })).toBeVisible();

  // Claim a shift in that league.
  const row = page.locator("div.group").filter({ hasText: "Storm-drain stencilling" });
  await row.getByRole("button", { name: /^sign up$/i }).click();
  await expect(row.getByRole("button", { name: /^you're in$/i })).toBeVisible();

  // Refresh: both records come back from SQLite, not browser state.
  await page.reload();
  await expect(page.getByRole("button", { name: /^you're in$/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /your justice points: 25/i })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Storm-drain stencilling")).toBeVisible();
  await expect(page.getByText(/signed the league charter/i)).toBeVisible();

  // Sign out, then sign back in with the same credentials.
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: /your justice points: 0/i })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: /your justice points: 25/i })).toBeVisible();
  await expect(page.getByText("Storm-drain stencilling")).toBeVisible();
});

test("two accounts see the same filled spots after refresh", async ({ browser, playwright }) => {
  const baseURL = test.info().project.use.baseURL!;
  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });

  try {
    const emailA = uniqueEmail("grace");
    const emailB = uniqueEmail("katherine");
    await registerViaApi(contextA, "Grace Hopper", emailA);
    await registerViaApi(contextB, "Katherine Johnson", emailB);

    // Both claim the same shift. Signing up also joins the league.
    for (const context of [contextA, contextB]) {
      const response = await context.request.post("/api/shifts/s18/signup");
      expect(response.ok(), await response.text()).toBeTruthy();
    }

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    for (const page of [pageA, pageB]) {
      await page.goto("/dashboard");
      await expect(page.getByText("Bike-to-market ride")).toBeVisible();

      await page.goto("/leagues/spoke");
      const row = page.locator("div.group").filter({ hasText: "Bike-to-market ride" });
      await expect(row).toBeVisible();
    }

    const spotsA = await pageA
      .locator("div.group")
      .filter({ hasText: "Bike-to-market ride" })
      .locator('[aria-label$="spots filled"]')
      .getAttribute("aria-label");
    const spotsB = await pageB
      .locator("div.group")
      .filter({ hasText: "Bike-to-market ride" })
      .locator('[aria-label$="spots filled"]')
      .getAttribute("aria-label");

    expect(spotsA).toBe(spotsB);
    expect(spotsA).toMatch(/^1[1-9] of 15 spots filled$/);

    // A signed-out reader sees the same count, and no personal data.
    const anonymous = await playwright.request.newContext({ baseURL });
    const edition = (await (await anonymous.get("/api/edition")).json()) as {
      shifts: { id: string; filled: number }[];
      me: null;
    };
    expect(edition.me).toBeNull();
    const shift = edition.shifts.find((item) => item.id === "s18")!;
    expect(spotsA).toBe(`${shift.filled} of 15 spots filled`);
    await anonymous.dispose();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("a seeded steward checks a volunteer in and the points stick", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL!;
  const volunteerContext = await browser.newContext({ baseURL });
  const stewardContext = await browser.newContext({ baseURL });

  try {
    await registerViaApi(volunteerContext, "Nia Roberts", uniqueEmail("nia"));
    const signup = await volunteerContext.request.post("/api/shifts/s11/signup");
    expect(signup.ok()).toBeTruthy();

    const steward = await stewardContext.newPage();
    await steward.goto("/login");
    await steward.getByLabel("Email", { exact: true }).fill("steward.harbor.1@justiceleagues.local");
    await steward.getByLabel("Password", { exact: true }).fill("millbrook");
    await steward.getByRole("button", { name: /^sign in$/i }).click();
    await expect(steward).toHaveURL(/\/dashboard$/);

    await steward.goto("/leagues/harbor/steward");
    await expect(steward.getByRole("link", { name: /^steward$/i })).toHaveAttribute("aria-current", "page");

    const row = steward.locator("li").filter({ hasText: "Nia Roberts" });
    await row.getByRole("button", { name: /mark nia roberts attended/i }).click();
    await expect(row).toContainText("24 JP");
    await expect(row).toContainText("attended");

    const volunteer = await volunteerContext.newPage();
    await volunteer.goto("/dashboard");
    await expect(volunteer.getByRole("link", { name: /your justice points: 49/i })).toBeVisible();
    await expect(volunteer.getByText(/attended storm-drain stencilling/i)).toBeVisible();
  } finally {
    await volunteerContext.close();
    await stewardContext.close();
  }
});
