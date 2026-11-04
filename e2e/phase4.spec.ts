import { expect, test } from "@playwright/test";

test("the atlas searches by name and keeps the URL shareable", async ({ page }) => {
  await page.goto("/leagues");
  await expect(page.locator("main article")).toHaveCount(10);
  await expect(page.locator("main figure button[aria-label^='Open ']")).toHaveCount(10);

  await page.getByRole("searchbox").fill("harbor");
  await expect(page).toHaveURL(/q=harbor/);
  await expect(page.locator("main article")).toHaveCount(1);
  await expect(page.locator("main article h2")).toHaveText("Harbor Cleanup Coalition");
  await expect(page.locator("main figure button[aria-label^='Open ']")).toHaveCount(1);

  await page.getByRole("searchbox").fill("no such league");
  await expect(page).toHaveURL(/q=no\+such\+league/);
  await expect(page.getByText(/nothing matches/i).first()).toBeVisible();

  await page.getByRole("button", { name: /reset the atlas/i }).click();
  await expect(page).toHaveURL(/\/leagues$/);
  await expect(page.locator("main article")).toHaveCount(10);
});

test("cause and distance filters narrow the atlas together", async ({ page }) => {
  await page.goto("/leagues?near=43.6532,-79.3832&radius=5");
  await expect(page.locator("main article").first()).toBeVisible();

  const cards = page.locator("main article");
  const total = await cards.count();
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThan(10);
  for (let index = 0; index < total; index += 1) {
    await expect(cards.nth(index)).toContainText(/away/);
  }

  await page.locator("main").getByRole("button", { name: "Food", exact: true }).click();
  await expect(page).toHaveURL(/cause=food/);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Marrow Street Food Network");
  await expect(page.locator("main").getByText("within 5 km", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /use the whole city/i }).click();
  await expect(page).not.toHaveURL(/near=/);
  await expect(cards).toHaveCount(1);
});

test.describe("near me", () => {
  test.use({ geolocation: { latitude: 43.6532, longitude: -79.3832 }, permissions: ["geolocation"] });

  test("geolocation fills the origin and distance filter", async ({ page }) => {
    await page.goto("/leagues");
    await page.getByRole("button", { name: /near me/i }).click();
    await expect(page).toHaveURL(/near=43\.653/);
    await expect(page.getByText(/near 43\.653/i)).toBeVisible();
    await expect(page.getByLabel(/search radius/i)).toHaveValue("5");
    await expect(page.locator("main article").first()).toContainText(/away/);
  });
});

test("a chapter has a shareable page and card", async ({ page }) => {
  await page.goto("/leagues/harbor/chapters/ch_harbor");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Mill River Docks");
  await expect(page.getByRole("heading", { name: /shifts posted here/i })).toBeVisible();
  await expect(page.getByText(/a chapter of harbor cleanup coalition/i)).toBeVisible();
  await expect(page).toHaveTitle(/Mill River Docks chapter — Harbor Cleanup Coalition/);

  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toContain("Justice Points");

  await page
    .locator("main")
    .getByRole("link", { name: /^the atlas$/i })
    .click();
  await expect(page).toHaveURL(/\/leagues$/);
});

test("the printed profile renders and offers a print button", async ({ page }) => {
  await page.goto("/leagues/harbor/print");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Harbor Cleanup Coalition");
  await expect(page.getByRole("button", { name: /print this profile/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /neighbourhood chapters/i })).toBeVisible();
  const rows = page.locator("article table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Mill River Docks");
  await expect(page.getByText(/printed from the local edition/i)).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("banner")).toBeHidden();
  await expect(page.getByRole("button", { name: /print this profile/i })).toBeHidden();
});

test("a newcomer finds a league within 5 km and joins it", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Display name").fill("New Neighbour");
  await page.getByLabel("Email", { exact: true }).fill(`newcomer-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: /open account/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/leagues?near=43.6532,-79.3832&radius=5");
  const nearest = page.locator("main article").first();
  await expect(nearest).toBeVisible();
  const name = (await nearest.locator("h2").innerText()).trim();
  await nearest.getByRole("link", { name: `Open ${name}` }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await page.getByRole("button", { name: /join league/i }).click();
  await expect(page.getByRole("button", { name: /you're in/i })).toBeVisible();
});

test("the atlas and chapter pages fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ["/leagues?q=harbor", "/leagues/harbor/chapters/ch_harbor"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
