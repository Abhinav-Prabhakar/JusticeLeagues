/**
 * Build the README visual set against a running demo server.
 *
 *   DB_PATH=./data/shots.db PORT=8791 npx tsx server/index.ts
 *   API_PORT=8791 npx vite --port 5176 --strictPort
 *   BASE_URL=http://localhost:5176 npm run shots:readme
 *
 * The script creates its own account, joins a league, claims a shift, and
 * writes desktop + mobile screenshots into docs/screenshots/. It then signs in
 * as a seeded chapter steward, records one attendance, and captures the desk.
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
await page
  .getByRole("button", { name: /^you're in$/i })
  .first()
  .waitFor();

const shift = page.locator("div.group").filter({ hasText: "Storm-drain stencilling" });
await shift.getByRole("button", { name: /^sign up$/i }).click();
await shift.getByRole("button", { name: /^you're in$/i }).waitFor();

await page.goto(`${base}/leagues/harbor`);
await shoot(page, "league", true);

await page.goto(`${base}/leagues/harbor/chapters`);
await shoot(page, "chapters", true);

await page.goto(base);
await shoot(page, "home", false);

await page.goto(`${base}/leagues`);
await shoot(page, "leagues", true);

await page.goto(`${base}/dashboard`);
await shoot(page, "dashboard", true);

// The exchange: post an offer, then claim a seeded need.
await page.goto(`${base}/leagues/harbor/resources`);
await page.getByText("Post an offer or a need").click();
await page.getByRole("button", { name: /i have something to lend/i }).click();
await page.getByLabel("Title", { exact: true }).fill("Cargo bike for chapter deliveries");
await page.getByLabel("Quantity / note").fill("1 bike · weekend loan");
await page.getByLabel("Details").fill("Two panniers, a lock, and a rack. Collect from the Mill River cupboard.");
await page.getByRole("button", { name: /pin it to the exchange/i }).click();
await page.getByText("Posted to the exchange").waitFor();
const need = page.locator("article").filter({ hasText: "A trailer for hauling cleanup bags" });
await need.getByRole("button", { name: /^i can help$/i }).click();
await page.getByText("Claimed — the poster can see your name").waitFor();
await page.waitForTimeout(2000);
await shoot(page, "resources", true);

// Ada files a completed project; the steward will review it on the desk.
await page.goto(`${base}/leagues/harbor/impact`);
await page.getByText("File a completed project").click();
await page.getByLabel("Project title").fill("Riverfront replanting");
await page.getByLabel("People").fill("12");
await page.getByLabel("Volunteer hours").fill("30");
await page.getByLabel("Measured result").fill("120 native saplings");
await page.getByLabel("Evidence link").fill("https://example.com/riverfront-replanting");
await page
  .getByLabel("What happened")
  .fill("Twelve neighbours replanted the east bank with native shrubs over two weekends.");
await page.getByRole("button", { name: /send to the review desk/i }).click();
await page.getByText("Project filed for steward review").waitFor();

// The seeded steward records Ada's attendance, then the desk is captured.
const stewardContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const steward = await stewardContext.newPage();
await steward.goto(`${base}/login`);
await steward.getByLabel("Email", { exact: true }).fill("steward.harbor.1@justiceleagues.local");
await steward.getByLabel("Password", { exact: true }).fill("millbrook");
await steward.getByRole("button", { name: /^sign in$/i }).click();
await steward.waitForURL(/\/dashboard$/);
await steward.goto(`${base}/leagues/harbor/steward`);
const attendance = steward.locator("li").filter({ hasText: "Ada Lovelace" });
await attendance.getByRole("button", { name: /mark ada lovelace attended/i }).click();
await attendance.getByText("24 JP").waitFor();
await steward.waitForTimeout(3200);
await shoot(steward, "steward", true);

// Mint an invitation, then photograph the landing page as a signed-out guest.
await steward.getByText("Invite a neighbour").click();
await steward.getByLabel("Note (optional)").fill("You fixed the east walk — come finish the job.");
await steward.getByRole("button", { name: /mint the invitation/i }).click();
await steward.getByText("Invitation minted — copy the link now").waitFor();
const inviteLink = await steward.getByLabel("Invitation link").inputValue();

const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const guest = await guestContext.newPage();
await guest.goto(inviteLink);
await shoot(guest, "invite", false);
await guestContext.close();

const reviewDesk = steward.locator("section").filter({ hasText: "Filed projects" });
await reviewDesk.scrollIntoViewIfNeeded();
await steward.evaluate(() => window.scrollBy(0, -90));
await steward.waitForTimeout(500);
await steward.screenshot({ path: `${outDir}/projects.png` });
console.log("captured projects (review desk)");

// The masthead settings, with the owner signed in.
await steward.goto(`${base}/leagues/harbor/settings`);
await steward.getByRole("heading", { name: /league settings/i }).waitFor();
await shoot(steward, "settings", true);
await stewardContext.close();

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
