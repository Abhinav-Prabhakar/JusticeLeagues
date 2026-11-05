# Justice Leagues — Prototype → Production Plan

Status: **Phase 6 complete**. The ledger is the single source of truth, the
standings cache and leaderboard are real, badges and streaks are earned from
the record, and stewards have an anomaly queue with an append-only reversal
tool. The atlas carries real coordinates, FTS5 discovery with distance
filters, shareable chapter pages, and a printed league profile. The paper now
runs itself: a transactional inbox, a report-and-review queue, an editor's desk
with strikes and audit, account export/delete, safeguarding for young
neighbours, and a WCAG 2.2 AA accessibility pass. The local press also has an
operator's side: structured logs, a private funnel and crash desk, verified
snapshots with a restore drill, a capacity race drill, and `docs/OPERATIONS.md`.

Design constraints for every phase: [`DESIGN.md`](./DESIGN.md).

---

## 1. Audit — what is actually fake today

| Area            | Current state                           | Risk                              |
| --------------- | --------------------------------------- | --------------------------------- |
| Identity        | No auth. "You" is a local chip.         | No real users, no ownership       |
| Persistence     | Everything in React context / `data.ts` | Refresh wipes all actions         |
| Membership      | `joined` Set in memory                  | Cannot coordinate with anyone     |
| Points          | Client adds `+25` / `+40` on click      | Trivially forgeable               |
| Leaderboard     | Sorted fixture array                    | Never reflects reality            |
| Shifts          | Fixed 18 fixtures, signup is local      | No capacity truth, no attendance  |
| Wins / projects | Three hard-coded cards                  | No submission or verification     |
| Resources       | Hard-coded classifieds                  | No posting, claiming, or handoff  |
| Map             | Decorative SVG with invented `x/y`      | Not geography                     |
| Search          | Client-side substring filter            | Breaks past one page of data      |
| Dashboard       | Drawer only; "Dashboard" button is dead | Core product loop missing         |
| Images          | Hot-linked Pexels URLs                  | Licensing + availability risk     |
| URLs            | Single page, no router                  | No shareable league links, no SEO |
| Quality         | No tests, lint, CI, error states        | Cannot iterate safely             |

Keep the visual layer. Replace the substrate.

---

## 2. North star

A neighbour can, in under two minutes:

1. Find a League for a cause they care about, near them.
2. Join it, see the next shift, and claim a spot.
3. Show up, get checked in, and see their hours and Justice Points land.
4. Watch the League's collective impact and rank move.

A steward can, in one screen:

1. Publish a shift and fill it.
2. Post a resource need and get it claimed.
3. Approve a completed project with evidence.
4. See who is active and who has gone quiet.

If those eight actions work with real people and real data, the product is
functional. Everything else is expansion.

---

## 3. Stack (opinionated, fully local)

**Constraint:** the whole app runs on one machine. No hosted backend, no
Supabase, no cloud auth, no external queue. Network calls to third parties are
limited to optional map tiles; fonts and seed images should eventually be
vendored so the app works offline.

**Frontend** — stay on what exists:

- React 19 + Vite + TypeScript + Tailwind 4 (already here).
- Add: React Router (real URLs), TanStack Query (server state), React Hook
  Form + Zod (forms/contracts), `date-fns` (timezones).
- Keep context for UI chrome only (drawer, filters, toasts). Delete the fake
  domain state from it.

**Backend** — a local Node service in the same repo:

- `Hono` on `@hono/node-server`, mounted at `/api`, Vite proxies to it in dev;
  the same server serves the built SPA in production.
- **SQLite via the built-in `node:sqlite` module** (Node 26). Zero native
  dependencies, one file on disk (`data/justice-leagues.db`), real SQL,
  transactional, easy to back up. This is the local equivalent of Postgres.
- Plain SQL migrations in `server/db/migrations/`, applied on boot with a
  `schema_migrations` table. A thin typed repository layer, not an ORM.
- **Auth:** local accounts. Email + password hashed with `scrypt`, opaque
  session tokens in an `httpOnly`, `SameSite=Lax` cookie, sessions stored in
  SQLite. No magic links — there is no mail server.
- Business rules (points, capacity, roles) live in the server, never the client.

**Supporting**

- Email: none. In-app notifications only.
- Maps: keep the hand-drawn editorial atlas. Optional MapLibre + OSM tiles
  later, but the core experience must not require network.
- Errors/analytics: local structured logs; Sentry optional and off by default.
- Testing: Vitest + Testing Library, Playwright for the eight critical flows.
- CI: GitHub Actions (typecheck, lint, unit tests, build, e2e).
- Images/fonts: vendor into `public/` during Phase 1 so the app is offline-safe.

---

## 4. Data model (first cut)

A League is **citywide**; its work happens in **neighbourhood chapters**. This
is the confirmed model: one league identity, one leaderboard entry, many local
cells. Membership is league-wide with an optional home chapter; shifts and
resources belong to a chapter; impact rolls up to the league.

```
profiles            id, handle, display_name, avatar_url, bio,
                    city_id, home_neighborhood_id, causes[], joined_at,
                    visibility(public|members)
cities              id, name, slug, center_lat/lng
neighborhoods       id, city_id, name, slug, lat/lng, boundary_geojson NULL
leagues             id, slug, name, cause, city_id, motto, description,
                    founded_year, avatar_url, cover_url, status(active|paused|
                    archived), recruiting, created_by
chapters            id, league_id, neighborhood_id, name, lat/lng,
                    status(active|dormant), lead_profile_id, created_at
league_members      league_id, profile_id, role(owner|steward|member),
                    chapter_id NULL, status(active|invited|left), joined_at
league_invites      id, league_id, token, role, chapter_id, expires_at, used_at
shifts              id, league_id, chapter_id, title, description, starts_at,
                    ends_at, timezone, place_name, lat/lng, capacity, bring[],
                    status(draft|open|full|cancelled|done)
shift_signups       shift_id, profile_id, status(reserved|confirmed|waitlist|
                    attended|no_show|cancelled), created_at, checked_in_at
projects            id, league_id, chapter_id, title, summary, occurred_on,
                    metrics jsonb, evidence_urls[], status(draft|submitted|
                    approved|rejected), submitted_by, reviewed_by, reviewed_at,
                    points_awarded
points_ledger       id, league_id, chapter_id NULL, profile_id NULL, delta,
                    reason, ref_type, ref_id, idempotency_key UNIQUE,
                    created_by, created_at
resources           id, league_id, chapter_id, kind(offer|want), title,
                    description, quantity, needed_by, status(open|claimed|
                    fulfilled|expired), created_by, claimed_by
resource_claims     resource_id, profile_id, message, status, created_at
posts               id, league_id, chapter_id NULL, author_id, body,
                    image_urls[], pinned
reports             id, reporter_id, target_type, target_id, reason, status
notifications       id, profile_id, kind, payload jsonb, read_at, created_at
badges              id, key, label, rule jsonb
profile_badges      profile_id, badge_id, awarded_at
sessions            id, profile_id, token_hash, expires_at, created_at
audit_log           id, actor_id, action, target_type, target_id, meta, at
```

Rules:

- Every table gets `created_at`/`updated_at`, soft-delete where content matters.
- `points_ledger` is **append-only**. Corrections are negative rows with a
  reason, never updates or deletes.
- Standings are a cached table/view (`league_standings`) rebuilt transactionally
  on write; never computed on the client.
- Chapter standings are derived by summing ledger rows with `chapter_id`.
- Authorization is enforced in the repository layer (`assertMember`,
  `assertSteward`, `assertOwner`) on every mutation; tests run two accounts.

---

## 5. Points integrity (the thing that makes or breaks the leaderboard)

Points are the product's credibility. Treat them like money.

Earning rules (server-enforced constants in `server/db/repository.ts` and
`src/data/projects.ts`):

| Event                   | Points                                    | Guard                               |
| ----------------------- | ----------------------------------------- | ----------------------------------- |
| First league joined     | +25 once per profile                      | unique ledger key                   |
| Verified shift attended | hours × 12, capped at 80 per shift        | steward check-in, 5 check-ins/day   |
| Project approved        | `50 + 4×hours + 2×people`, clamped 50–500 | steward review, one per project     |
| Resource fulfilled      | not minted — tracked on the exchange      | both sides confirm                  |
| Weekly streak           | not minted — badge + streak display only  | computed from positive ledger weeks |

Badges (13, evaluated server-side in `server/db/badges.ts`): first join, first
shift, five/ten shifts, first/three projects, 100/1000 points, four-week and
twelve-week streaks, chapter builder, ledger keeper, and charter steward.
Resource fulfilment and the weekly streak are deliberately display-only right
now: the ledger stays small and every row is defensible.

Non-negotiables:

- Client never sends a point delta. It sends an _action_; the server computes.
- Idempotency key per event (`shift:<id>:<profile>`), so retries cannot double-award.
- Soft caps + anomaly flags (e.g. 40h/week, >5 check-ins/day) go to steward review.
- Public ledger page shows every award: who, what, when, how much.
- Leaderboard scopes: global / city / cause / chapter / month. Ranks are cached
  in `league_standings` / `chapter_standings` and rebuilt on every ledger write.
  For this single-city prototype "city" is the all-time total; "month" is a true
  calendar-month sum with a pace-adjusted delta for "most improved".
- Chapter points must sum to league points. One ledger, two rollups — asserted
  by tests.

---

## 6. Phases

Estimates assume one focused developer. Parallelise phases 3–5 with a second.

### Phase 0 — Stabilise the prototype (2–3 days) — **complete**

- Add ESLint, Prettier, Vitest, Playwright, GitHub Actions (typecheck, lint,
  test, build, e2e).
- Stand up the local server (`server/`) with Hono + `node:sqlite`, a `/api/health`
  probe, Vite proxy, and `npm start` serving the built SPA.
- Extract `src/ui/` primitives from `lib.tsx`; move fixtures behind a
  `src/data/` adapter so the UI stops importing `data.ts` directly.
- Add React Router with routes: `/`, `/leagues`, `/leagues/:slug`,
  `/dashboard`, `*`.
- Replace the dead "Dashboard" button with a real personal desk page
  (joined leagues, roster, points) backed by current local state.
- Fix known UI debt: hover-only data lacks focus/tap parity; keyboard access
  for cards and atlas rows; skip link; visible focus rings.
- Add global error boundary, 404, and loading skeletons.

**Exit:** CI green; every route renders; no dead buttons on the main page;
`npm run dev` starts web + API with one command and `npm start` serves the
production build offline.

### Phase 1 — Identity + local data foundation (2–3 weeks) — **complete**

- SQLite migrations for profiles, cities, neighbourhoods, leagues, chapters,
  members, shifts, signups, wins, points ledger, sessions; seed from current
  fixtures. ✅
- Local auth: email + password (`scrypt`), opaque cookie sessions (hashed at
  rest), login/register, logout, protected mutations, per-IP rate limits. ✅
- Onboarding: display name, home neighbourhood, causes. First-league
  suggestion is deferred to discovery work in Phase 4. ✅ (partial)
- Typed API client (`src/lib/api`) + TanStack Query; Zod request schemas. ✅
- Repository-level authorization: every mutation requires a session and
  membership is checked before league/shift writes. Steward/owner role
  assertions now guard check-in, rosters, and shift authoring. ✅
- Persisted join/leave and shift signup with optimistic updates and rollback. ✅
- Vendor fonts and seed images into `public/` for offline use. ✅
- E2E isolation: Playwright runs its own API, ports and `data/e2e.db`; specs
  cover registration, reload persistence, sign-out/sign-in, and two accounts
  sharing one shift's filled count. ✅

**Exit:** met — two accounts on one league see the same filled spots after a
refresh, and the app runs with no network (fonts and photography are local).

**What Phase 1 deliberately does not do:** steward check-in, attendance →
hours, project approval, chapter switcher, member roster roles, and the
standings cache. Those are Phase 2/3 and are the next points of leverage.

### Phase 2 — League + chapter dashboards (2–3 weeks) — **complete**

The core product. A real route, not a drawer.

- `LeagueShell`: league masthead, cause emblem, role badge, chapter switcher,
  tab nav (Overview · Shifts · Chapters · Members · Resources · Impact · Settings).
  ✅ Overview · Shifts · Chapters · Members · Resources · Impact · Steward and
  Settings (role-gated).
- Chapter model in the UI: a citywide league rolls up N neighbourhood chapters;
  every shift, resource, and project is filed under a chapter. ✅
- Overview: next shift, fill rate, active members, points sparkline, recent win. ✅
- Shifts: create/edit/cancel; capacity + waitlist; signup; steward check-in;
  attendance → hours → points. ✅ create/edit/cancel, capacity, signup,
  waitlist promotion, check-in, hours → points.
- Members: roster, roles (owner/steward/member), chapter assignment, invite by
  local link token, remove. ✅ roster, roles, home-chapter assignment,
  single-use member/steward invites, steward/owner removal rules.
- Resources: post offer/want, claim, fulfil, expire; photo optional.
  ✅ post offer/want, claim, release, fulfil, expire, claim history; photos still
  open.
- Projects/Wins: submit with metrics + evidence; steward approve/reject;
  approval triggers points and a public win card. ✅ 50–500 JP by metrics;
  rejection mints nothing; chapter rollups include approved projects.
- Settings: league identity, cause, city, recruiting toggle, archive.
  ✅ stewards edit identity/cause/recruiting; only the owner archives.

**Exit:** met — a real league with two chapters can run one full week: publish
shift → fill it → waitlist a neighbour → check in → log hours → approve a
project → see points and rank update at both chapter and league level.

### Phase 3 — Standings, impact, and anti-gaming (1–2 weeks) — **complete**

- `league_standings` / `chapter_standings` cache tables rebuilt inside the same
  transaction as every ledger write and once on startup. ✅ Rebuild is a
  handful of set-based queries: a temp aggregate table plus one windowed
  `INSERT OR REPLACE … SELECT` assigns all four ranks.
- Server-side leaderboard with scopes (global / city / cause / chapter / month)
  and deterministic tie-breakers (points, then members, then league id). ✅
  `GET /api/standings`; the sidebar and Overview read cached ranks, never a
  client sort.
- Real impact ledger aggregation from approved projects (not hard-coded rows).
  ✅ `GET /api/impact` and `GET /api/leagues/:id/impact`; chapters, categories
  and the last twelve months come from the ledger.
- Tiers/badges, streaks, monthly rollups, "most improved" editorial module. ✅
  13 badges evaluated server-side, `first_join` counts roster seats so
  printed-edition members earn it; streaks come from positive ledger weeks;
  the month is a rolling calendar aggregate with a pace-adjusted delta, so
  nothing resets and history is never lost.
- Rate limits, caps, anomaly queue, admin reversal tool. ✅ attendance is capped
  at 80/shift and 5 check-ins/day; soft-cap flags queue for stewards;
  `POST /api/leagues/:id/ledger/:entryId/reverse` appends a correction, never
  edits, and refuses a second reversal.
- Public points ledger page for transparency. ✅ `/ledger` filters by league and
  entry kind, paginates, and labels imported history. A database with no live
  awards falls back to the sealed history and says so; `?live=1` skips it.

**Exit:** met — displayed points always equal `SUM(points_ledger)`; chapter
totals sum to league totals; no client path can mint points; the leaderboard
query answers in under 300ms at 10k leagues, with the cache rebuild held to a
separate write-path budget (covered by `server/db/phase3.test.ts`).

### Phase 4 — Discovery, atlas, and sharing (1–2 weeks) — **complete**

- Real cities/neighbourhoods; lat/lng on leagues and chapters. ✅ Leagues gain
  `lat`/`lng`; neighbourhood and chapter positions are backfilled from the
  shared geography table on startup, and a linear projection keeps every
  hand-placed atlas pin exactly where it was designed.
- Editorial atlas from real coordinates; optional MapLibre + OSM tiles with a
  drawn fallback when offline. ✅ The drawn SVG atlas is the shipped map, so
  discovery works with no tiles, no network, and no API key; pins are plotted
  from real coordinates.
- Server-side SQLite search (FTS5) with cause + distance filters; debounced,
  URL-synced. ✅ `league_search` FTS5 cache rebuilt on startup and after league
  settings changes; bm25 relevance then haversine distance; `q`, `cause`,
  `near`, and `radius` live in the URL with a 300 ms input debounce.
- Public league/chapter pages with shareable routes, meta tags, and a print view.
  ✅ `/leagues/:id/chapters/:chapterId`, per-route description/OG/Twitter tags,
  a copy/native share button, and a dedicated print sheet with print CSS.
- Optional: "near me" geolocation with a graceful manual fallback. ✅ Browser
  geolocation, a neighbourhood picker, and a whole-city reset; a blocked or
  unsupported browser explains itself and keeps the manual path.

**Exit:** met — `e2e/phase4.spec.ts` walks a newcomer from registration through
a 5 km search to opening the nearest league and joining it. The same suite
covers cause + radius filters, URL sync, geolocation, chapter pages, the print
view, and phone-width overflow.

### Phase 5 — Trust, comms, and operations (2 weeks) — **complete**

- In-app notifications inbox (signup, approval, reminder, waitlist promotion). ✅
  Every notice is a row written inside the transaction that caused it; the
  masthead bell reads `MeDTO.unread` and the inbox filters all/unread.
- Moderation: report content, steward hide, admin queue, strike policy. ✅
  Reports dedupe per reporter and item; hiding keeps the record; three upheld
  strikes pause posting for 14 days while reading, joining, and reporting stay
  open.
- Admin console: users, leagues, reports, point reversals, feature flags. ✅
  `/admin` carries overview, reports, people, flags, and audit tabs; role
  changes and self-demotion are guarded.
- Audit log; data export/delete; local privacy + terms; photo consent language. ✅
  `/privacy` exports a JSON copy and deletes the profile while anonymising the
  ledger; `/terms` states the house rules; registration carries photo consent.
- Safeguarding: age gate, no minor contact details exposed, steward guidance. ✅
  Registration requires an age confirmation; teens require guardian consent;
  handles and emails are masked in every DTO and fall back to display names.
- Accessibility audit to WCAG 2.2 AA; fix all keyboard/touch parity gaps. ✅
  Tokens darkened to AA, cause fills use `onColor()`, shape and scale controls
  expose names and pressed state, headings are ordered, and every route scores
  100 in Lighthouse accessibility.

**Exit:** met — `e2e/phase5.spec.ts` walks a new account through the inbox, a
reporter through the report form and the editor's hide decision, a 16-year-old
through guardian consent and public masking, and every new page through a
390px viewport with no overflow. The API suite covers the age gate, guardian
consent, dedupe, strikes and restoration, admin gates, flags, audit, export,
and delete. A stranger can now run a league without the founder editing the
database by hand.

### Phase 6 — Hardening and launch (2 weeks) — **complete**

- Performance: route-level code splitting, self-hosted images, LCP < 2.5s. ✅
  Every route is lazy; photography and fonts are vendored. The front-page hero
  is preloaded, eager, and `fetchpriority="high"`; `e2e/phase6.spec.ts` measures
  LCP against the 2.5s budget.
- Observability: local structured logs, error boundary reporting, backup job. ✅
  JSON lines on stdout or `LOG_FILE`, request ids on every response, redacted
  secrets, `/api/health` with storage and backup age, `POST /api/errors` from the
  error boundary, and the editor's **Admin → Pulse** crash desk.
- Load test leaderboard and shift signup race conditions (capacity must not
  oversell — transaction + unique constraint). ✅
  `npm run load` starts an isolated `data/load.db` server, races a shift's last
  spots, asserts waitlist overflow and duplicate idempotency, then reads the
  leaderboard 200 times and checks database integrity.
- E2E coverage of the eight north-star actions. ✅
  `e2e/phase6.spec.ts` walks find → join → publish/fill → claim → check-in →
  points → impact/rank → resource handoff → project approval on one record,
  and asserts the public page reads what the server wrote.
- Pilot with 3 real leagues; instrument funnel; weekly feedback loop. ✅
  `pulse_events` stores allowlisted page names and server-authored actions only;
  `pilot_notes` records the weekly friction/win/decision. **Admin → Pulse**
  carries activation, liquidity, reliability, retention, integrity, and the
  pilot three on one screen.
- Ops runbook: DB backup/restore drill, migration rollback, incident notes. ✅
  `npm run db:backup`, `npm run db:restore`, and `npm run ops:check`; a verified
  restore keeps a `pre-restore-*` safety copy. [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
  covers the daily check, logs, rollback policy, incident template, launch
  checklist, and Monday feedback cadence.

**Exit:** met — the edition runs locally with real accounts, verified snapshots,
a restore drill, a documented rollback path, and a weekly pilot loop. The unit
suite covers 129 tests and Playwright covers 32, including the eight north-star
actions and the LCP budget. `npm run load` passes with the capacity, waitlist,
and leaderboard budgets intact.

---

## 7. Cross-cutting requirements

**Security**

- Authorization in the repository layer; deny by default; test with two accounts.
- Session tokens hashed at rest; `httpOnly`, `SameSite=Lax`, short expiry.
- Rate limit login, registration, signup, posting, and claims.
- Validate uploads (MIME/size); strip EXIF location on public photos.
- Never expose emails, addresses, or exact home coordinates publicly.
- Parameterized SQL only; never string-interpolate user input.

**Accessibility**

- WCAG 2.2 AA: contrast, focus visible, target ≥ 24px, no motion traps.
- Hover revelations duplicated on focus and tap (see DESIGN.md §2).
- Real `<button>`/`<a>` semantics; skip link; landmark structure.

**Performance**

- Route-level lazy loading; leaderboard paginated.
- Self-hosted, pre-sized images; `srcset`; fixed aspect ratios.
- Keep the editorial texture (noise, halftone) CSS-only, never as large images.

**Testing**

- Unit: points rules, capacity math, streak calc, date/timezone.
- Integration: authorization, ledger idempotency, signup concurrency.
- E2E: join, claim shift, check-in, submit project, approve, leaderboard moves.

**Analytics (privacy-respecting)**

- Activation: visitor → league view → join.
- Liquidity: % shifts filled, % shifts with ≥ 1 signup 48h out.
- Reliability: show-up rate (attended / confirmed).
- Retention: 4-week active member rate per league.
- Integrity: points per active member, reversal rate, report rate.

---

## 8. Risks and mitigations

| Risk                    | Mitigation                                                                 |
| ----------------------- | -------------------------------------------------------------------------- |
| Empty-league cold start | Seed with 3 pilot leagues; "nearby" fallback; recruiting flag              |
| Points gaming           | Append-only ledger, server rules, caps, review, public transparency        |
| No-shows poison trust   | Waitlists, reminders, steward check-in, reliability score (private)        |
| Safety incidents        | Safeguarding policy, reporting, no home addresses, meet-in-public defaults |
| Steward burnout         | Roles, co-stewards, templates, digest automation, "quiet league" nudges    |
| Over-building           | Ship the eight north-star actions before chat, donations, native apps      |
| Single-machine limit    | SQLite WAL, nightly file backup, export/import, migration path to Postgres |
| Local-only no recovery  | Backup job + restore drill before real data lives in it                    |

---

## 9. Explicitly out of scope for v1

- Hosted multi-tenant deployment, cloud sync, real-time collaboration.
- Real-time chat / DMs (moderation cost too high at launch).
- Donations, payments, grants, fiscal sponsorship.
- Native mobile apps (responsive PWA first).
- Federation across cities, custom domains per league.
- AI features (matching, summarisation) before the data is real and clean.

---

## 10. Next ten tasks (in order)

1. Create `DESIGN.md` ✅ and keep it in the PR template.
2. Remove the live-wire marquee ✅.
3. Add ESLint/Prettier/Vitest/Playwright + CI. ✅
4. Introduce React Router and route skeletons. ✅
5. Extract `src/ui` primitives; freeze the visual layer. ✅
6. Stand up the local Hono + SQLite server with `/api/health`. ✅
7. Write migrations for profiles/cities/neighbourhoods/leagues/chapters/shifts. ✅
8. Seed from the fixtures; swap the home page to read from the database. ✅
9. Build local auth + onboarding. ✅
10. Ship league Overview + Shifts with persisted signup → check-in → points. ✅
11. Give every league three neighbourhood chapters; file joins under a home
    chapter. ✅
12. Replace the single league page with a tabbed shell and a public roster. ✅
13. Add steward check-in (hours → ledger) and steward-authored shifts. ✅
14. Ship project approval with evidence. ✅
15. Ship shift waitlists/editing, member removal, and league settings. ✅
16. Make the ledger the source of truth, add cached standings, real impact and
    badges, and the anomaly queue + public ledger page (Phase 3). ✅
17. Add real coordinates, FTS5 search, shareable chapter pages, and the printed
    league profile (Phase 4). ✅
18. Ship notifications, moderation, the admin console, safeguarding, and an
    accessibility pass (Phase 5). ✅
19. Ship performance budgets, structured logs, the private pulse, backups, load
    tests, and the pilot loop (Phase 6). ✅

Done when: a stranger can join a league, claim a shift, and see verified points
that a steward — not a browser — awarded. **Met.**
