# PropBot — AI Real Estate Acquisition & Deal Pipeline Manager

Full-stack **MERN** (MongoDB · Express · React · Node.js) implementation of the PropBot PRD and System Architecture documents.
PropBot ingests raw seller leads, geocodes them with OpenStreetMap, underwrites them with Google Gemini, scores them 0–100,
drafts a cash-offer range, moves them through a strict pipeline state machine and emails approved offers through SendGrid.

```
[Webhook / CSV / Dashboard form] ──► Express API ──┬──► Gemini 2.5 Flash (underwriting, JSON schema output)
                                                   ├──► Nominatim (geocoding + neighborhood)
                                                   └──► SendGrid (seller offers, clarifications, daily digest)
                                                          │
                                       MongoDB (leads · users · job runs · audit trail)
                                                          │
                                 React + Tailwind dashboard (served by the same container)
                        GCP Cloud Scheduler ──► /api/jobs/* (audit, digest, inbound sweep)
```

---

## Features (mapped to the PRD)

| PRD requirement | Where it lives |
|---|---|
| **4.1 REST webhook** `POST /api/leads` | `server/src/routes/leads.js` — `x-api-key` auth, batches of 25, idempotent via `external_id` |
| **4.1 CSV bulk importer** | `POST /api/leads/import` + **CSV import** page (preview, campaign tag, progress) |
| **4.1 Data normalization** | `server/src/utils/normalize.js` — field aliases, `$350k`/`1.2M` parsing, address casing, timeline buckets, HTML stripping |
| **4.2 Feature extraction** | Gemini prompt + structured JSON schema → `defects[]` with severity and repair cost |
| **4.2 Deal Viability Score 0–100** | Equity spread (60) + offer fit (20) + motivation (15) + data quality (5) |
| **4.2 Offer range** | 70% rule: `MAO = ARV × 0.70 − repairs`, range `[0.9 × MAO, MAO]`, capped at asking |
| **4.3 Nominatim geocoding** | `server/src/services/geocoder.js` — 1 req/s throttle, LRU cache, compliant User-Agent |
| **4.4 State machine** | `server/src/services/stateMachine.js` — Inbound → Underwritten → Offer Drafted → Awaiting Approval → Outreach Sent (+ Dead branch, admin overrides with reason) |
| **4.5 SendGrid outreach** | Cash-offer, clarification and follow-up templates; simulated mode when no key |
| **4.5 Cloud Scheduler** | `/api/jobs/audit` (stale hot leads), `/api/jobs/digest` (daily summary), `/api/jobs/process-pending` |
| **5 Reliability** | Exponential backoff with jitter + `Retry-After` for all 3 APIs; Gemini failure → deterministic rules engine so leads are never lost |
| **5 Performance < 3 s** | Geocoding and Gemini run concurrently inside a 2.8 s budget; `processing_ms` stored per lead and shown on the dashboard |
| **3.1 Dashboard** | Overview KPIs, drag-and-drop Kanban, filterable table, lead drawer with AI reasoning audit log, map, defects, timeline, manual overrides |
| **7 KPIs** | Time-to-underwrite, % under 3 s, automation rate, pipeline value on the Overview page |

Extras: JWT auth with admin / manager / viewer roles, team management, CSV export, notes, bulk actions, job-run history, structured JSON logs for Cloud Logging, Docker image, seed data.

---

## The three front ends

| App | URL | Who uses it |
|---|---|---|
| **Acquisition dashboard** | `/` (login) | Admins & managers: overview, pipeline board, leads, import, settings |
| **Investor desk** | `/investor` (login, role `investor`, also visible to admins/managers) | Approve & send, adjust, send back or reject offers; equity in queue; seller acceptance rate; live seller responses |
| **“Sell your house” website** | `/sell` (public) | Sellers submit their property → normalized, geocoded and AI-underwritten instantly (source `website`) |
| **Seller portal** | `/offer/<private-token>` (public) and `/offer` (lookup) | Sellers track their request, see the approved cash offer and **accept, decline or counter** |

**Roles:** fully dynamic — see *Roles & permissions* below.
The seed script creates a demo investor: `investor@propbot.local` with the same password as `ADMIN_PASSWORD`.

**Seller portal flow**
1. Seller submits at `/sell` (or arrives via webhook/CSV) → a private token is created and the seller gets a confirmation email with the link.
2. The portal shows “Under review” — no scores, margins or AI notes are ever exposed to sellers.
3. When an offer is approved, the offer email contains the portal link. The seller accepts, declines or counters (with an optional message).
4. The response appears on the Investor desk, the lead drawer, the pipeline card and the daily digest; the team gets an email alert (`DIGEST_RECIPIENTS`).
5. To answer a counter, move the lead back to *Awaiting Approval* and approve a new amount — the seller gets a fresh offer.

Public endpoints: `POST /api/public/leads` (honeypot + consent + rate limit, 8 per 15 min per IP), `GET /api/portal/:token`, `POST /api/portal/:token/respond`, `POST /api/portal/lookup` (emails the link; never reveals whether a match exists).
Team endpoints added: `POST /api/leads/:id/decision` (`send_back` | `reject`, reason required), `GET /api/leads/:id/portal-link`, `GET /api/stats/investor`, list filter `?response=accepted,countered`.

Set `PUBLIC_APP_URL` (your public address) so links in emails are correct, and `COMPANY_NAME` for the brand shown on the public site.

---

## Roles & permissions (dynamic)

Access is controlled by **23 permissions**, each tied to a page or button (e.g. `investor.view`, `leads.import`, `offers.approve`, `users.manage`).
The server checks them on every request; the dashboard hides pages and buttons the user can't use.

| Default role | What it can do |
|---|---|
| **Super Admin** | Everything, including *Roles & permissions*. Locked (can't be edited) so nobody can lock everyone out. The first admin account becomes Super Admin automatically. |
| **Admin** | Everything except editing role permissions |
| **Acquisition Manager** | Overview, pipeline, leads, investor desk; create / import / edit / delete / move / underwrite leads; approve, reject and email offers; run jobs |
| **Investor** | Investor desk, pipeline and leads (read-only); approve, send back or reject offers; copy seller links |
| **Viewer** | Read-only dashboards and leads, CSV export |

**Changing permissions at any time** (Settings → *Roles & permissions*, Super Admin):
- Tick / untick permissions per role in the matrix and click **Save changes** — affected users see the change within a minute, without logging out.
- **New role** — create custom roles (optionally copying another role's permissions). Default roles can be **reset**; custom roles can be deleted when no users have them.

**Per-user exceptions** (Settings → *Team* → **Permissions**, needs `users.manage`): for each permission choose *Role default*, **Allow** or **Block** for just that person.
Effective permissions = role permissions + allowed − blocked.

Safety rules: there is always at least one active Super Admin; you can't change your own role or remove *Manage roles & permissions* from your own role; only a Super Admin can assign the Super Admin role; non-super-admins can only hand out permissions they hold themselves.

API: `GET /api/roles`, `GET /api/roles/permissions`, `POST /api/roles`, `PATCH /api/roles/:key`, `POST /api/roles/:key/reset`, `DELETE /api/roles/:key`; users: `PATCH /api/auth/users/:id` with `role`, `permission_grants`, `permission_denies`. `GET /api/auth/me` returns the user's effective `permissions`.

---

## Dark mode

Every screen (team dashboard, Investor desk, seller website and seller portal) supports **Light / Dark / System**.
The switch is in the sidebar, the public site header, the login page and *Settings → Profile*; the choice is saved per device and "System" follows the OS setting.

How it's built: `tailwind.config.js` uses `darkMode: 'class'`; the slate scale and the `paper`, `line`, `surface` and `well` colors read CSS variables defined in `client/src/index.css` (light on `:root`, dark on `html.dark`), so most of the UI themes itself. Tinted badges and alerts get dark equivalents at the bottom of `index.css`. `client/public/theme-init.js` applies the saved theme before first paint (no white flash).

---

## Quick start (local)

**Requirements:** Node.js 20+, MongoDB 6+ (local, Docker, or a free MongoDB Atlas M0 cluster).

```bash
# 1. Install
npm run install:all

# 2. Configure the API
cp server/.env.example server/.env
#   - MONGODB_URI     → your MongoDB
#   - GEMINI_API_KEY  → free key from https://aistudio.google.com/apikey  (optional: rules engine is used without it)
#   - SENDGRID_*      → optional: emails are "simulated" and logged without it
#   - ADMIN_EMAIL / ADMIN_PASSWORD → first login (created automatically on first boot)

# 3. (Optional) load 12 demo leads
npm run seed            # add  "-- --reset" to wipe existing leads first

# 4. Run API (port 5000) and dashboard (port 5173) in two terminals
npm run dev:server
npm run dev:client
```

Open http://localhost:5173 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Docker (MongoDB + app in one command)

```bash
cp server/.env.example server/.env   # add keys
docker compose up --build            # → http://localhost:8080
docker compose exec app node src/scripts/seed.js   # optional demo data
```

### Tests

```bash
npm test   # normalization, CSV parser, state machine, underwriting math
```

---

## API reference

All endpoints are under `/api`. Dashboard calls use `Authorization: Bearer <token>` from `POST /api/auth/login`.

### Ingestion
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/leads` (alias `/leads/webhook`) | JWT **or** `x-api-key` | One lead object, or `{ "leads": [...] }` (≤ 25). Returns the underwritten lead. |
| POST | `/leads/import` | JWT (manager+) | `multipart/form-data` with `file` (CSV ≤ 1,000 rows) and optional `campaign`. Underwriting runs in the background. |
| GET | `/leads/import/template.csv` | JWT | Column template |
| GET | `/leads/import/status` | JWT | Background queue progress |

Example webhook call:
```bash
curl -X POST https://YOUR-HOST/api/leads \
  -H "Content-Type: application/json" -H "x-api-key: $WEBHOOK_API_KEY" \
  -d '{"external_id":"LIST-1","property_address":"4521 Magnolia Ave, Memphis, TN 38117","asking_price":145000,
       "property_condition":"Roof leaks, HVAC broken","seller_timeline":"ASAP","seller_email":"seller@example.com"}'
```

Accepted field aliases: `address`, `price`, `email`, `phone`, `name`, `notes`/`description`/`condition`, `timeline`, `sqft`, `beds`, `baths`.

### Leads
| Method | Path | Notes |
|---|---|---|
| GET | `/leads` | Filters: `q, status (comma list), priority, minScore, maxScore, stale, source, engine, from, to`; `sort = newest\|oldest\|score\|score_asc\|price\|price_asc\|updated`; `page, limit` |
| GET | `/leads/export.csv` | Same filters, CSV download |
| GET | `/leads/:id` | Full lead incl. timeline + outreach |
| PATCH | `/leads/:id` | Edit fields; re-underwrites automatically when property inputs change (Inbound/Underwritten) |
| DELETE | `/leads/:id` | |
| POST | `/leads/:id/underwrite` | Re-run geocoding + AI |
| POST | `/leads/:id/status` | `{ status, reason, override }` — override is admin-only and requires a reason |
| POST | `/leads/:id/submit-for-approval` | Offer Drafted → Awaiting Approval |
| POST | `/leads/:id/approve` | `{ offer, note }` — sends the cash-offer email, then → Outreach Sent |
| POST | `/leads/:id/outreach` | `{ kind: clarification\|follow_up, note }` |
| GET | `/leads/:id/email-preview` | `?kind=&offer=&note=` |
| POST | `/leads/:id/notes` | `{ message }` |
| POST | `/leads/bulk/status`, `/leads/bulk/delete` | `{ ids, status }` |

### Other
`GET /health` · `GET /system/status` · `GET /stats/summary?days=30` · `POST /auth/login` · `GET/PATCH /auth/me` · `GET/POST/PATCH/DELETE /auth/users` (admin) · `GET /jobs` · `GET /jobs/runs` · `POST /jobs/:job` (`x-cron-secret` or JWT)

### State machine

```
Inbound ──► Underwritten ──► Offer Drafted ──► Awaiting Approval ──► Outreach Sent
   │  ╲________________________▲  ▲  │               │  ▲                  │
   │      (score ≥ threshold)     └──┘ (send back)   └──┘ (re-review)      │
   └──────────────► Dead ◄──────────────────────────────────────────────────┘
                     └──► Inbound (revive)
```
`Outreach Sent` can only be reached through **Approve & send** (or a logged admin override), so every offer that leaves the building is human-approved and emailed.

---

## Deploying on the GCP Always Free tier

1. **Database** — create a free **MongoDB Atlas M0** cluster, add a DB user, allow `0.0.0.0/0` (Cloud Run has no fixed IP), copy the connection string.
2. **Build & deploy to Cloud Run** (scales to zero):
   ```bash
   gcloud run deploy propbot --source . --region us-central1 --allow-unauthenticated \
     --memory 512Mi --max-instances 2 \
     --set-env-vars "NODE_ENV=production,MONGODB_URI=...,JWT_SECRET=...,WEBHOOK_API_KEY=...,CRON_SECRET=...,GEMINI_API_KEY=...,SENDGRID_API_KEY=...,SENDGRID_FROM_EMAIL=...,DIGEST_RECIPIENTS=...,ADMIN_EMAIL=...,ADMIN_PASSWORD=...,NOMINATIM_USER_AGENT=PropBot/1.0 (contact: you@company.com)"
   ```
   Prefer Secret Manager (`--set-secrets`) for keys in real use.
3. **Cloud Scheduler** (3 free jobs per billing account):
   ```bash
   URL=$(gcloud run services describe propbot --region us-central1 --format='value(status.url)')
   gcloud scheduler jobs create http propbot-audit  --schedule="0 * * * *"   --uri="$URL/api/jobs/audit"  --http-method=POST --headers="x-cron-secret=$CRON_SECRET"
   gcloud scheduler jobs create http propbot-digest --schedule="0 8 * * 1-5" --uri="$URL/api/jobs/digest" --http-method=POST --headers="x-cron-secret=$CRON_SECRET"
   gcloud scheduler jobs create http propbot-sweep  --schedule="*/15 * * * *" --uri="$URL/api/jobs/process-pending" --http-method=POST --headers="x-cron-secret=$CRON_SECRET"
   ```

**Free-tier notes**
- Cloud Run throttles CPU after a response is sent, so large CSV imports finish via the `process-pending` sweep (every lead is saved as *Inbound* first — nothing is lost). For immediate background processing use `--no-cpu-throttling` (may leave the free tier) or keep imports small.
- Gemini free tier is rate-limited; on `429` PropBot backs off, then falls back to the rules engine and records why in the reasoning log. Re-run underwriting later from the lead drawer.
- Nominatim allows ~1 request/second; PropBot throttles and caches automatically.
- Cloud Run, Cloud Scheduler, Atlas M0, Gemini (AI Studio) and SendGrid's free plan can be used without spending money, but GCP itself requires a billing account to enable Cloud Run/Scheduler APIs — stay within the free quotas.

---

## Project structure

```
propbot/
├── server/                      Express API
│   ├── src/
│   │   ├── app.js / server.js   App factory, security middleware, static dashboard, graceful shutdown
│   │   ├── config/              env + MongoDB connection (with retry)
│   │   ├── models/              Lead (with embedded timeline/outreach), User, JobRun
│   │   ├── routes/              leads, auth, stats, jobs, system
│   │   ├── services/            pipeline, gemini, heuristics, geocoder, email, stateMachine, jobs, queue
│   │   ├── middleware/          JWT / API-key / cron auth, error handling
│   │   ├── utils/               normalize, csv, retry/backoff, structured logger
│   │   └── scripts/             seed, createAdmin, bootstrap
│   └── test/                    node:test unit tests
├── client/                      React + Vite + Tailwind dashboard
│   └── src/ pages · components · context · lib
├── Dockerfile                   Multi-stage: builds dashboard, serves it from the API
└── docker-compose.yml           MongoDB + app
```

## Design notes

- **MongoDB instead of SQLite/PostgreSQL.** The architecture doc lists SQLite/PostgreSQL; this build uses MongoDB as requested (MERN). The lead document keeps every column from the doc's `leads` schema (`property_address`, `asking_price`, `latitude`, `viability_score`, `estimated_offer_min/max`, `ai_reasoning`, `status`, `created_at` …) and adds the audit timeline, outreach log, defects and neighborhood as embedded sub-documents, so a lead and its full history load in one read.
- **AI output is never trusted blindly.** Gemini is constrained by a JSON response schema, then sanitized: scores are clamped, offer ranges outside 60–125% of the 70%-rule MAO are replaced by the formula, and offers never exceed asking price.
- **Humans approve every offer.** The state machine prevents any path to *Outreach Sent* except the approve endpoint, which sends the email first and only advances the stage if delivery succeeds.
