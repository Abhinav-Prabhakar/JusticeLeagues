# Justice Leagues — Prototype → Production Plan

Status: **Phase 2 complete**. The SQLite substrate, local auth, persisted
signups, neighbourhood chapters, the tabbed league shell, steward check-in,
steward shift authoring, shift waitlists and editing, project approval, the
resource exchange, chapter invitations, member removal, and league settings are
real. Standings cache and the server-side leaderboard are Phase 3.

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

Earning rules (server-enforced, versioned in `points_rules`):

| Event                   | Points                      | Guard                           |
| ----------------------- | --------------------------- | ------------------------------- |
| First league joined     | +25 once per profile        | unique ledger key               |
| Verified shift attended | hours × 10, cap 80/shift    | steward check-in                |
| Project approved        | 50–500 by metric + evidence | steward review, one per project |
| Resource fulfilled      | +15                         | both sides confirm              |
| Weekly streak           | +20 per active week, cap 4  | computed nightly                |

Non-negotiables:

- Client never sends a point delta. It sends an _action_; the server computes.
- Idempotency key per event (`shift:<id>:<profile>`), so retries cannot double-award.
- Soft caps + anomaly flags (e.g. 40h/week, >5 check-ins/day) go to steward review.
- Public ledger page shows every award: who, what, when, how much.
- Leaderboard scopes: global / city / cause / chapter / month, with a
  minimum-activity threshold so a brand-new league with one big project does not
  top the table.
- Chapter points must sum to league points. One ledger, two rollups.

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

### Phase 3 — Standings, impact, and anti-gaming (1–2 weeks)

- `league_standings` cache table rebuilt in the same transaction as ledger writes.
- Server-side leaderboard with scopes (global / city / cause / chapter / month)
  and tie-breakers.
- Real impact ledger aggregation from approved projects (not hard-coded rows).
- Tiers/badges, streaks, monthly resets, "most improved" editorial module.
- Rate limits, caps, anomaly queue, admin reversal tool.
- Public points ledger page for transparency.

**Exit:** displayed points always equal `SUM(points_ledger)`; chapter totals sum
to league totals; no client path can mint points; leaderboard < 300ms at 10k
leagues.

### Phase 4 — Discovery, atlas, and sharing (1–2 weeks)

- Real cities/neighbourhoods; lat/lng on leagues and chapters.
- Editorial atlas from real coordinates; optional MapLibre + OSM tiles with a
  drawn fallback when offline.
- Server-side SQLite search (FTS5) with cause + distance filters; debounced,
  URL-synced.
- Public league/chapter pages with shareable routes, meta tags, and a print view.
- Optional: "near me" geolocation with a graceful manual fallback.

**Exit:** a newcomer can find and join a league within 5 km in under 2 minutes.

### Phase 5 — Trust, comms, and operations (2 weeks)

- In-app notifications inbox (signup, approval, reminder, waitlist promotion).
- Moderation: report content, steward hide, admin queue, strike policy.
- Admin console: users, leagues, reports, point reversals, feature flags.
- Audit log; data export/delete; local privacy + terms; photo consent language.
- Safeguarding: age gate, no minor contact details exposed, steward guidance.
- Accessibility audit to WCAG 2.2 AA; fix all keyboard/touch parity gaps.

**Exit:** can operate with strangers without the founder manually fixing data.

### Phase 6 — Hardening and launch (2 weeks)

- Performance: route-level code splitting, self-hosted images, LCP < 2.5s.
- Observability: local structured logs, error boundary reporting, backup job.
- Load test leaderboard and shift signup race conditions (capacity must not
  oversell — transaction + unique constraint).
- E2E coverage of the eight north-star actions.
- Pilot with 3 real leagues; instrument funnel; weekly feedback loop.
- Ops runbook: DB backup/restore drill, migration rollback, incident notes.

**Exit:** a dependable local deployment with real users, recoverable data, and a
rollback plan.

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
16. Next: `league_standings` cache and the server-side leaderboard (Phase 3).

Done when: a stranger can join a league, claim a shift, and see verified points
that a steward — not a browser — awarded.
