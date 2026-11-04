/**
 * Vendor the seed photography and web fonts into `public/` so the app works
 * with no network. Run once (or when the fixtures change):
 *
 *   npm run vendor:assets
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const photoDir = path.join(root, "public/photos");
const fontDir = path.join(root, "public/fonts");

const PHOTOS = [
  36713110, 4595706, 6591154, 6301906, 34261218, 5940832, 9090903, 8342411, 39778154, 40068319, 26614518, 6590928,
  17837310,
];

const FONT_CSS =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=IBM+Plex+Mono:wght@400;500;600",
    "family=Libre+Franklin:wght@400;500;600;700;800;900",
    "family=Playfair+Display:ital,wght@0,500;0,700;0,800;0,900;1,500;1,700;1,900",
    "family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400",
  ].join("&") +
  "&display=swap";

async function vendorPhotos() {
  await mkdir(photoDir, { recursive: true });
  for (const id of PHOTOS) {
    const url = `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1200&h=800`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`photo ${id}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path.join(photoDir, `${id}.jpg`), bytes);
    console.log(`photo ${id} → ${(bytes.length / 1024).toFixed(0)} kB`);
  }
}

async function vendorFonts() {
  await mkdir(fontDir, { recursive: true });
  const response = await fetch(FONT_CSS, {
    headers: {
      // A modern UA gets woff2 rather than legacy formats.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`fonts css: ${response.status}`);
  const css = await response.text();

  const blocks = css.match(/@font-face\s*\{[^}]+\}/g) ?? [];
  const kept = blocks.filter((block) => {
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1] ?? "";
    // Latin only. Keep blocks without a range (they apply everywhere).
    return !range || range.includes("U+0000-00FF");
  });

  let out = "/* Vendored from Google Fonts. Latin subsets only. */\n";
  const seen = new Map();

  for (const block of kept) {
    const url = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
    if (!url) continue;
    let file = seen.get(url);
    if (!file) {
      const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
      file = `${createHash("sha256").update(url).digest("hex").slice(0, 12)}.woff2`;
      await writeFile(path.join(fontDir, file), bytes);
      seen.set(url, file);
    }
    out += `${block.replace(/src:[^;]+;/, `src: url("/fonts/${file}") format("woff2");`)}\n`;
  }

  await writeFile(path.join(fontDir, "fonts.css"), out);
  console.log(`fonts → ${seen.size} woff2 files, ${kept.length} @font-face blocks`);
}

await vendorPhotos();
await vendorFonts();
