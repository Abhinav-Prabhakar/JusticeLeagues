/**
 * Wipe the e2e database before Playwright starts the API.
 * Kept in a script so the webServer command stays a single shell-free step.
 */
import { rmSync } from "node:fs";
import path from "node:path";

const target = path.resolve(process.cwd(), "data/e2e.db");
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${target}${suffix}`, { force: true });
}
console.log(`e2e database reset: ${path.relative(process.cwd(), target)}`);
