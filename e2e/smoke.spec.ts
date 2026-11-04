import { expect, test } from "@playwright/test";

test("front page has no live-wire marquee", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Justice");
  await expect(page.getByText("Live wire")).toHaveCount(0);
});

test("public league page opens from the atlas", async ({ page }) => {
  await page.goto("/leagues");
  await page
    .getByRole("link", { name: /Open Harbor Cleanup Coalition/i })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: /Harbor Cleanup Coalition/i })).toBeVisible();
});

test("league tabs deep-link and survive a reload", async ({ page }) => {
  await page.goto("/leagues/harbor");
  await page.getByRole("link", { name: /^chapters$/i }).click();
  await expect(page).toHaveURL(/\/leagues\/harbor\/chapters$/);
  await expect(page.getByRole("heading", { level: 2, name: /Mill River Docks/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: /Mill River Docks/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^chapters$/i })).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: /^impact$/i }).click();
  await expect(page).toHaveURL(/\/leagues\/harbor\/impact$/);
  await expect(page.getByRole("heading", { level: 2, name: /Chapter by chapter/i })).toBeVisible();
});

test("personal desk is reachable from the nav", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /your justice points/i }).click();
  await expect(page.getByRole("heading", { level: 1, name: /your desk/i })).toBeVisible();
});

test("no horizontal overflow at phone widths", async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      "/",
      "/leagues",
      "/ledger",
      "/leagues/harbor",
      "/leagues/harbor/shifts",
      "/leagues/harbor/chapters",
      "/leagues/harbor/members",
      "/leagues/harbor/impact",
      "/leagues/harbor/steward",
      "/dashboard",
      "/login",
      "/register",
    ]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});
