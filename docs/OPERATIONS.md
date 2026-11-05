# Operations

The whole paper runs on one machine. There is no cloud, no queue, and no
third-party monitor. That makes operations small, but it also means the
backup file and the log file are the recovery plan. This is the runbook.

- Database: `data/justice-leagues.db` (SQLite, WAL)
- Backups: `data/backups/justice-leagues-*.db`
- Logs: stdout as JSON lines, or `LOG_FILE=data/logs/app.ndjson`
- Health: `GET /api/health` and the editor's **Admin → Pulse** tab
- Exit code for the daily check: `npm run ops:check`

---

## 1. Every day

```bash
npm run ops:check
```

The command is deliberately boring. It returns JSON and exits non-zero when the
database fails `PRAGMA integrity_check`, has foreign-key violations, or has no
migrations recorded. It also warns about:

- no backup in the last 48 hours
- unresolved client crash reports
- a WAL file over 100 MB
- an empty migration table

Read the operator glance at `GET /api/health`:

```bash
curl -s http://127.0.0.1:8787/api/health | jq
```

```json
{
  "ok": true,
  "storage": "sqlite",
  "database": { "bytes": 1458176, "walBytes": 0, "migrations": 11 },
  "backup": { "count": 3, "latestAt": "2026-11-04T02:00:00.000Z", "ageHours": 8.2 },
  "uptimeSeconds": 61200,
  "node": "v26.12.1"
}
```

Every response carries `x-request-id`. A crash report in the editor's desk
shows the same id, so a broken screen can be traced to one request in the log.

---

## 2. Structured logs

The API writes one JSON object per line:

```json
{"ts":"2026-11-04T14:02:11.004Z","level":"info","msg":"http.request","requestId":"req_...","method":"GET","path":"/api/standings","status":200,"ms":4,"profileId":null}
```

| Variable    | Default | Meaning                                         |
| ----------- | ------- | ----------------------------------------------- |
| `LOG_LEVEL` | `info`  | `debug`, `info`, `warn`, or `error`             |
| `LOG_FILE`  | stdout  | Append to a file instead of the terminal        |

```bash
LOG_LEVEL=warn LOG_FILE=data/logs/app.ndjson npm start
```

Passwords, tokens, cookies, authorisation headers, secrets, and guardian
consent are redacted. Long strings are clipped and nested objects are bounded,
so a hostile request body cannot flood a line. Static asset requests are not
logged; API calls, 4xx, and 5xx responses are.

Useful greps:

```bash
tail -f data/logs/app.ndjson | jq 'select(.level == "error")'
jq 'select(.requestId == "req_…")' data/logs/app.ndjson
jq 'select(.slow == true)' data/logs/app.ndjson
```

---

## 3. Backups

`VACUUM INTO` writes a consistent snapshot while the server is running, so no
maintenance window is needed. The snapshot is verified with
`PRAGMA integrity_check` before it is kept.

```bash
npm run db:backup
# backup: data/backups/justice-leagues-2026-11-05T05-00-00-000Z-ab12c.db
# backup: 1423.4 KB · 11 migrations · integrity ok
```

Snapshots are pruned to the latest 14. Schedule the command once a day with
`cron` or a `launchd` agent; it is safe to run while the app is serving.

```cron
0 2 * * * cd /path/to/JusticeLeagues && /usr/bin/env npm run db:backup >> data/logs/backup.log 2>&1
```

The backup is a complete SQLite file. Copy it off the machine if the machine
itself is the thing you are protecting against.

### Restore drill (do this before real data exists)

Run the drill on a copy first, then once on the real installation:

1. Stop the server.
2. Make a fresh backup: `npm run db:backup`.
3. Restore the latest snapshot:

   ```bash
   npm run db:restore
   # restore: from …/justice-leagues-….db
   # restore: integrity ok · 11 migrations
   # restore: previous database kept at …/pre-restore-….db
   ```

4. Restore a specific file instead: `npm run db:restore -- data/backups/<file>.db`.
5. Start the server and open `/api/health`; `database.migrations` must match.
6. Sign in, open the ledger, and confirm the last known award is present.

`restore` always snapshots the live database first and refuses a file that
fails the integrity check. If the restore was a mistake, restore the
`pre-restore-*` file the same way.

### What a backup does not cover

- `public/` and `dist/` — rebuild them from git (`npm ci && npm run build`).
- Environment variables and the log directory — keep them in your own notes.
- Browser sessions — they live in the database, so a restore signs everyone
  out.

---

## 4. Migrations and rollback

Migrations are plain SQL in `server/db/migrations/`, applied in filename order
and recorded in `schema_migrations`.

Rules:

- **Forward only.** Never edit a migration that has run. Add the next number.
- **Additive first.** Add columns and tables; avoid destructive rewrites.
- **Idempotent on a fresh database.** `npm run db:reset` must rebuild from
  empty with no manual steps.
- **Back up before a risky migration.** Then run the app once and check
  `npm run ops:check`.

There is no down-migration. The rollback plan is:

1. Stop the server.
2. `npm run db:restore` to the snapshot taken immediately before the deploy.
3. Check out the previous commit and rebuild.
4. Start the server, confirm `/api/health`, then record the incident below.

This is why every migration is small and every deploy starts with a backup.

---

## 5. Load and race drills

```bash
npm run load
```

The script starts a second API on `data/load.db` (`:8790`), never the real
database. It registers enough volunteers to fill the last spots of a shift,
sends the signups at once, and verifies:

- no spot is sold twice and the overflow lands on the waitlist
- a duplicate signup is idempotent
- 200 leaderboard reads stay under a 500 ms p95 local budget
- the admin pulse records the new accounts
- the SQLite file still passes `PRAGMA integrity_check`

Override the knobs with `LOAD_PORT`, `LOAD_DB`, `LOAD_REQUESTS`, and
`LOAD_CONCURRENCY`. The database is deleted at the end.

The capacity guarantee is server-side: every signup runs inside
`BEGIN IMMEDIATE`, and the count is read inside the same transaction. The
browser cannot mint a spot.

---

## 6. Incident notes

Keep a short entry for every incident in the pilot log (or a file beside this
one). One screen is enough:

```text
Date / time:
Symptom (what a neighbour saw):
Request id / log line:
Cause:
Fix:
Data lost?  (no / restored from <file>)
Follow-up:
```

During an incident:

1. **Protect the record.** Do not delete rows to make a screen look right.
   Hide content instead; hiding keeps the record.
2. **Read the logs, not the console.** Find the `requestId` from the crash desk
   or the response header.
3. **Check the database.** `npm run ops:check` before and after any write.
4. **If the database is suspect,** stop writes and restore the latest verified
   snapshot. A restore loses the time since that snapshot; say so plainly.
5. **Write the note.** A fix without a note will be repeated.

Known limits, stated honestly:

- One Node process. In-memory rate limits reset on restart.
- SQLite is the only store. Backups are files on the same machine by default.
- There is no automatic failover; recovery is the restore drill above.
- Client crash reports are best-effort. A browser that never loads the app
  cannot report its own failure.

---

## 7. Pilot launch checklist

Before three real leagues use the edition:

**Data and access**

- [ ] `npm run db:reset` (or a deliberate production seed) on the real machine.
- [ ] Each pilot league has an owner and at least one steward who has signed in.
- [ ] Demo accounts are removed or their passwords changed.
- [ ] `npm run db:backup` succeeds and the file is copied off the machine.

**Product**

- [ ] The eight north-star actions pass: find, join, claim, attend/points,
      impact/rank, publish/fill a shift, post/claim a resource, approve a
      project, see active members.
- [ ] `npm run test` and `npm run test:e2e` are green.
- [ ] `npm run load` is green.
- [ ] The atlas, league page, shifts, dashboard, and admin desk load on the
      pilot device (phone and desktop) with no horizontal overflow.

**Trust**

- [ ] `/privacy` and `/terms` are current.
- [ ] The age gate and guardian consent were exercised with a test account.
- [ ] The editor can see and resolve a crash report from **Admin → Pulse**.
- [ ] Reports route to a person who will answer within one working day.

**Operations**

- [ ] `LOG_FILE` is set and the log directory is backed up or rotated.
- [ ] The daily `db:backup` job runs; `npm run ops:check` exits 0.
- [ ] Phone numbers and a fallback channel exist for each steward.
- [ ] The restore drill has been completed once on this machine.

---

## 8. Weekly feedback loop

Every Monday, the editor spends 20 minutes on **Admin → Pulse** and files one
note:

1. **Funnel** — did league views turn into charters and claimed shifts? If a
   step fell, ask the stewards what changed; do not guess from the number.
2. **Liquidity** — how many open spots are there, and how many filled within
   48 hours? A full board is a scheduling problem, not a marketing problem.
3. **Reliability** — show-up rate and no-shows. Call the people who no-showed
   once; do not punish them in the product.
4. **Retention** — 4-week active members against the roster. A league with a
   high roster and low activity needs a smaller, more regular shift.
5. **Integrity** — reversals, open anomalies, reports per 100 members. Any
   reversal is a story about a rule that is not clear enough.
6. **Pilot three** — points, members, shifts, signups, and last activity. A
   league that has gone quiet gets a visit, not a reminder email.
7. **Crash desk** — close every open report or note why it cannot be closed.
8. **Write the note.** One friction, one win, one decision for next week.

The note is stored in the database (`pilot_notes`) and appears on the same
screen, so the next week starts where the last one stopped.

Review the pilot after four weeks. Keep a league if it has an owner, a regular
shift, and at least one approved project. If it does not, ask whether the
league is real yet instead of adding features to compensate.

---

## 9. Useful commands

```bash
npm run dev            # web :5173 · api :8787
npm run build          # typecheck + production bundle
npm start              # dist/ + /api on :8787
npm run db:seed        # migrate + seed if empty
npm run db:reset       # rebuild the local database
npm run db:backup      # verified snapshot in data/backups/
npm run db:restore     # latest snapshot (or pass a file)
npm run ops:check      # integrity, backups, open crashes
npm run load           # capacity race + leaderboard load drill
npm run test           # unit + API integration
npm run test:e2e       # isolated Playwright run
```
