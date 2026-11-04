/**
 * Build the README visual set against a running demo server.
 *
 *   DB_PATH=./data/shots.db PORT=8791 npx tsx server/index.ts
 *   API_PORT=8791 npx vite --port 5176 --strictPort
 *   BASE_URL=http://localhost:5176 npm run shots:readme
 *
 * The script creates its own account, joins a league, claims a shift, and
 * writes desktop + mobile screenshots into docs/screenshots/.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:5176";
const outDir = "docs/screenshots";
const email = `readme-${Date.now()}@example.com`;
const password = "correct horse battery";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        y += 500;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 90);
        else {
          window.scrollTo(0, 0);
          setTimeout(resolve, 700);
        }
      };
      step();
    });
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
}

async function shoot(page, name, fullPage = false) {
  await settle(page);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage });
  console.log(`captured ${name}${fullPage ? " (full page)" : ""}`);
}

// Desktop: register, join, claim.
const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await desktop.newPage();

await page.goto(`${base}/register?next=%2Fleagues%2Fharbor`);
await page.getByLabel("Display name").fill("Ada Lovelace");
await page.getByLabel("Email", { exact: true }).fill(email);
await page.getByLabel("Password", { exact: true }).fill(password);
await page.getByRole("button", { name: /open account/i }).click();
await page.waitForURL(/\/leagues\/harbor$/);
await page.getByRole("button", { name: /^join league$/i }).click();
await page.getByRole("button", { name: /^you're in$/i }).first().waitFor();

const shift = page.locator("div.group").filter({ hasText: "Storm-drain stencilling" });
await shift.getByRole("button", { name: /^sign up$/i }).click();
await shift.getByRole("button", { name: /^you're in$/i }).waitFor();

await page.goto(`${base}/leagues/harbor`);
await shoot(page, "league", true);

await page.goto(base);
await shoot(page, "home", false);

await page.goto(`${base}/leagues`);
await shoot(page, "leagues", true);

await page.goto(`${base}/dashboard`);
await shoot(page, "dashboard", true);

// Mobile viewports.
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const phone = await mobile.newPage();
await phone.goto(`${base}/register?next=%2Fleagues%2Fharbor`);
await phone.getByLabel("Display name").fill("Grace Hopper");
await phone.getByLabel("Email", { exact: true }).fill(`phone-${Date.now()}@example.com`);
await phone.getByLabel("Password", { exact: true }).fill(password);
await phone.getByRole("button", { name: /open account/i }).click();
await phone.waitForURL(/\/leagues\/harbor$/);

await phone.goto(base);
await shoot(phone, "mobile-home", false);

await phone.goto(`${base}/leagues/harbor`);
await shoot(phone, "mobile-league", false);

await phone.goto(`${base}/dashboard`);
await shoot(phone, "mobile-dashboard", false);

await browser.close();
console.log(`\nREADME shots written to ${outDir}/`);
