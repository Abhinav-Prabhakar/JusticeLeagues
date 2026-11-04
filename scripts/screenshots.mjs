import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

/**
 * Design-review screenshots. Requires `npm run dev` to be running.
 * Usage: npm run shots [-- http://localhost:5173]
 *
 * Scrolls each page first so lazy images and in-view reveals resolve,
 * then captures a full-page PNG.
 */

const base = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:5173";
const outDir = process.env.SHOT_DIR ?? "/tmp/jl-shots";

const pages = [
  ["home", "/"],
  ["leagues", "/leagues"],
  ["league-harbor", "/leagues/harbor"],
  ["dashboard", "/dashboard"],
  ["not-found", "/this-page-does-not-exist"],
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();

for (const [name, path] of pages) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        y += 400;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) {
          setTimeout(step, 140);
        } else {
          window.scrollTo(0, 0);
          setTimeout(resolve, 900);
        }
      };
      step();
    });
  });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`captured ${name} → ${outDir}/${name}.png`);
}

await browser.close();
