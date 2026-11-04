#!/usr/bin/env node
/**
 * Build the read-only Pages edition and push it to the `gh-pages` branch.
 * Pages serves that branch directly, so no deployment workflow is involved.
 *
 *   npm run publish:pages
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: "inherit" });

run("npm", ["run", "build:pages"]);

const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root }).toString().trim();

const out = mkdtempSync(path.join(tmpdir(), "jl-pages-"));
try {
  cpSync(path.join(root, "dist"), out, { recursive: true });
  writeFileSync(path.join(out, ".nojekyll"), "");

  run("git", ["init", "--initial-branch=gh-pages"], out);
  run("git", ["add", "-A"], out);
  run(
    "git",
    ["-c", "user.name=Justice Leagues", "-c", "user.email=justice@localhost", "commit", "-m", "Publish static edition"],
    out,
  );
  run("git", ["remote", "add", "origin", remote], out);
  run("git", ["push", "--force", "origin", "gh-pages"], out);

  console.log("Published the static edition to the gh-pages branch.");
} finally {
  rmSync(out, { recursive: true, force: true });
}
