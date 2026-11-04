<div align="center">
  <img src="docs/banner.svg" alt="The Justice Leagues — organised neighbours, measured impact" width="100%" />
</div>

<div align="center">
  <a href="https://github.com/Abhinav-Prabhakar/justice-leagues/stargazers"><img src="https://img.shields.io/github/stars/Abhinav-Prabhakar/justice-leagues?style=flat-square&labelColor=14110d&color=f2b705" alt="Stars" /></a>
  <a href="https://github.com/Abhinav-Prabhakar/justice-leagues/commits/main"><img src="https://img.shields.io/github/last-commit/Abhinav-Prabhakar/justice-leagues?style=flat-square&labelColor=14110d&color=1b7f5c" alt="Last commit" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Abhinav-Prabhakar/justice-leagues?style=flat-square&labelColor=14110d&color=d9381e" alt="License" /></a>
  <img src="https://img.shields.io/badge/tests-32_unit_%C2%B7_8_e2e-1b7f5c?style=flat-square&labelColor=14110d" alt="Tests" />
  <img src="https://img.shields.io/badge/react-19-2347c5?style=flat-square&labelColor=14110d" alt="React 19" />
  <img src="https://img.shields.io/badge/typescript-strict-2347c5?style=flat-square&labelColor=14110d" alt="TypeScript" />
  <img src="https://img.shields.io/badge/sqlite-local_only-f2b705?style=flat-square&labelColor=14110d" alt="SQLite" />
  <img src="https://img.shields.io/badge/node-%E2%89%A522.5-1b7f5c?style=flat-square&labelColor=14110d" alt="Node 22.5+" />
</div>

<h3 align="center">A local-first civic newspaper for citywide leagues, neighbourhood chapters,<br/>volunteer shifts, and Justice Points.</h3>

<p align="center">
  <a href="#run-it"><strong>Run it</strong></a> ·
  <a href="#the-paper-in-pictures"><strong>Screens</strong></a> ·
  <a href="#under-the-hood"><strong>Architecture</strong></a> ·
  <a href="ROADMAP.md"><strong>Roadmap</strong></a>
</p>

<img src="docs/screenshots/home.webp" alt="The Justice Leagues front page" width="100%" />

## What it is

- **Citywide leagues, neighbourhood chapters.** Climate, safety, food, transit, learning, housing, health, rights.
- **Real shifts, real capacity.** Join a league, claim a shift, survive a refresh. Two accounts see the same filled spots.
- **A steward desk, not a form.** Stewards post shifts, cancel them, and record attendance. Hours become points.
- **Server-authored Justice Points.** Append-only ledger. Joining awards +25 once; signup mints nothing; check-in awards hours × 12.

> Points land when a steward checks you in — not when you tap sign up. That distinction is the whole leaderboard.

## The paper in pictures

<table>
  <tr>
    <td width="50%"><a href="docs/screenshots/league.webp"><img src="docs/screenshots/league.webp" alt="League page with tabs, standing, chapters, and open shifts" /></a><br/><sub><b>League page</b> · tabs, standing, and the next shift</sub></td>
    <td width="50%"><a href="docs/screenshots/steward.webp"><img src="docs/screenshots/steward.webp" alt="Steward desk with a checked-in volunteer and an awarded ledger entry" /></a><br/><sub><b>Steward desk</b> · post a shift, record hours, mint nothing by hand</sub></td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/screenshots/chapters.webp"><img src="docs/screenshots/chapters.webp" alt="Neighbourhood chapter cards with points, members, and shifts" /></a><br/><sub><b>Chapters</b> · every point rolls up to the citywide league</sub></td>
    <td width="50%"><a href="docs/screenshots/dashboard.webp"><img src="docs/screenshots/dashboard.webp" alt="Personal desk with points, roster, and ledger" /></a><br/><sub><b>Your desk</b> · points, roster, and the ledger</sub></td>
  </tr>
  <tr>
    <td colspan="2"><a href="docs/screenshots/leagues.webp"><img src="docs/screenshots/leagues.webp" alt="Every league in the atlas" /></a><br/><sub><b>The Atlas</b> · every league, one editorial index</sub></td>
  </tr>
</table>

<table>
  <tr>
    <td width="33%"><a href="docs/screenshots/mobile-home.webp"><img src="docs/screenshots/mobile-home.webp" alt="Front page on a phone" /></a></td>
    <td width="33%"><a href="docs/screenshots/mobile-league.webp"><img src="docs/screenshots/mobile-league.webp" alt="League page on a phone" /></a></td>
    <td width="33%"><a href="docs/screenshots/mobile-dashboard.webp"><img src="docs/screenshots/mobile-dashboard.webp" alt="Your desk on a phone" /></a></td>
  </tr>
  <tr>
    <td align="center"><sub>Front page</sub></td>
    <td align="center"><sub>League</sub></td>
    <td align="center"><sub>Your desk</sub></td>
  </tr>
</table>

## Under the hood

<img src="docs/architecture.svg" alt="Browser to Hono API to SQLite" width="100%" />

| Layer  | Choice                                                           |
| ------ | ---------------------------------------------------------------- |
| UI     | React 19 · Vite · Tailwind 4 · TanStack Query                    |
| API    | Hono on Node · Zod · scrypt · hashed session cookies             |
| Data   | `node:sqlite` · plain-SQL migrations · append-only points ledger |
| Assets | Photography and fonts vendored into `public/` — fully offline    |

## Run it

```bash
npm install
npm run dev        # web :5173 · api :8787
```

Production-ish, one origin:

```bash
npm run build
npm start          # dist/ + /api on :8787
```

Local data lives in `data/justice-leagues.db`.

```bash
npm run db:seed    # migrate + seed if empty
npm run db:reset   # throw the paper away and rebuild it
```

### Demo stewards

A fresh seed gives every chapter a steward. The founding chapter's steward owns the league. They all use the password `millbrook`:

```text
steward.harbor.1@justiceleagues.local   # owner, Mill River Docks
steward.harbor.2@justiceleagues.local   # steward, City Centre
steward.harbor.3@justiceleagues.local   # steward, Eastside
```

Swap `harbor` for any league id (`spoke`, `ridgeline`, `civic`, …) and `1`–`3` for a chapter. These are local demo accounts — nothing leaves the machine.

## Checks

```bash
npm run typecheck
npm run lint
npm run test       # 32 unit + API integration tests
npm run test:e2e   # 8 Playwright tests, isolated :8788 / :5174 / data/e2e.db
npm run shots      # design-review screenshots → /tmp/jl-shots
```

## House rules

- **No hosted services.** No Supabase, no cloud sync, no telemetry.
- **Points are data, not decoration.** Every award is a ledger row with an idempotency key.
- **Editorial first.** Read [`DESIGN.md`](DESIGN.md) before touching the UI.
- **Commit small, push often.** See [`AGENTS.md`](AGENTS.md).

<div align="center">
  <sub>Photography from <a href="https://www.pexels.com/license/">Pexels</a> · typefaces via <a href="https://fonts.google.com/">Google Fonts</a> (OFL) · built with too much coffee.</sub>
</div>
