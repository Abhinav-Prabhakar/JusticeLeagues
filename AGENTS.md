# Working agreement

Future agent sessions: read this before touching the repo.

## Commit and push cadence

- **Commit and push after every coherent slice of work.** Not at the end of a
  long session, not in one giant commit.
- A slice is one of: a schema/migration, an API endpoint, a screen or route,
  a test suite, a docs/visual pass.
- Keep `main` green. Run the relevant checks before each push:

  ```bash
  npm run typecheck && npm run lint && npm run test
  ```

- Use small, imperative commit messages (`Add league shell tabs`,
  `Persist shift signups`), not `wip` or `misc`.
- If a change is risky, push a branch and open a PR instead of committing to
  `main`; still push early and often.
- Never commit `data/`, `dist/`, `node_modules/`, or test artifacts.

## Product rules

- Everything runs locally. No Supabase, no hosted database, no telemetry.
- Points are server-authored and append-only. The browser cannot mint points.
- Read `DESIGN.md` before UI work; read `ROADMAP.md` before adding features.
- Migrations are plain SQL and must be idempotent on a fresh database.
- Seed data lives in `src/data/fixtures.ts`; keep the browser and seed aligned.

## Useful commands

```bash
npm run dev          # web :5173 · api :8787
npm run test         # unit + API integration
npm run test:e2e     # isolated :8788 / :5174 / data/e2e.db
npm run db:reset     # rebuild the local database
npm run shots:readme # regenerate docs/screenshots (needs demo server)
```
