# CoworkAI

**Your AI co-worker for WhatsApp & Telegram** — https://coworkai.axxeler.in

Multi-tenant SaaS where business owners create an AI agent, teach it their business, bring their own AI key,
connect Google (Sheets, Calendar, Gmail, Drive, Docs) with **their own Google Cloud credentials**, and connect it to
**WhatsApp** (official Cloud API or QR) and **Telegram**.

| Folder            | What                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `apps/api`        | Fastify 5 + TypeScript + Prisma/Postgres, pg-boss queue, Baileys, Google OAuth, Nodemailer |
| `apps/web`        | Next.js 16 (App Router) + Tailwind v4 + shadcn-style UI + TanStack Query                   |
| `packages/shared` | zod schemas, plan limits, brand/contact constants, AI provider catalogue                   |
| `docker/`         | Caddyfile (production reverse proxy on **:8080**)                                          |

Package manager: **npm workspaces** (Node ≥ 22.22).

Contact: aiwithsalman33@gmail.com · +91 81480 35472

---

## Local development

### Option A — everything in Docker (hot reload)

```bash
cp .env.example .env          # fill JWT_SECRET + ENCRYPTION_KEY (commands are in the file)
docker compose up --build     # db + api (tsx watch) + web (next dev)
```

- Web: http://localhost:3000 · API: http://localhost:4000 · Postgres: localhost:5433
- Uses `docker-compose.yml` + `Dockerfile.dev`. Source is bind-mounted, so edits reload automatically.

### Option B — Node on your machine, database in Docker

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run build:shared
npm run db:deploy             # apply migrations
npm run dev:api               # http://localhost:4000 (seeds 40 skills + admin on boot)
npm run dev:web               # http://localhost:3000
```

Without SMTP settings in development, verification and reset emails are **printed in the API log**, so you can
click the link from there.

## Tests

```bash
docker compose up -d db
npm test                      # Vitest (uses database partner_test on localhost:5433)
npm run lint && npm run typecheck
ADMIN_EMAIL=… ADMIN_PASSWORD=… E2E_BASE_URL=http://localhost:8080 npm run test:e2e   # Playwright against a running stack
```

> Windows tip: run Vitest from a path with an upper-case drive letter (`D:\…`). A lower-case `d:` path makes Vitest
> load twice and every test file fails with "failed to find the runner".

---

## Production (coworkai.axxeler.in)

The production stack is `docker-compose.prod.yml`: **db + api + web + Caddy**. Only Caddy is published, on **port 8080**:

```
Internet ──HTTPS──▶ TLS proxy (Dokploy/Traefik, Cloudflare, nginx…) ──▶ :8080 Caddy ─┬─ /api/*, /webhooks/* ─▶ api:4000
                                                                                    └─ everything else     ─▶ web:3000
```

```bash
cp .env.example .env.production   # fill it in (see below)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Required in `.env.production`:

- `APP_URL=https://coworkai.axxeler.in`
- `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`. **Back up `ENCRYPTION_KEY`.** It decrypts every stored key and token.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: the first admin is created on boot
- `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: needed for signup verification emails (see Gmail below)

### Deploying with Dokploy

1. DNS: an `A` record for `coworkai.axxeler.in` pointing at the server.
2. Dokploy → **Create Service → Compose** → Git repo `aiwithsalman33/cowork.ai`, branch `main`, compose path
   `./docker-compose.prod.yml`.
3. **Environment**: paste your `.env.production` values.
4. **Domains**: `coworkai.axxeler.in` → service **caddy**, port **8080**, HTTPS on.
5. Deploy. The api runs `prisma migrate deploy`, seeds skills and flags, creates the admin, and restores WhatsApp QR
   sessions from the `wa_sessions` volume.

Health: `GET /health/ready` (api via Caddy) and `GET /web-health` (web via Caddy).
Run **one** api replica: Baileys QR sessions must not be shared between processes.

> If `docker compose build` asks for an extra BuildKit `fs.read` privilege (seen with Docker Desktop on Windows),
> build with plain Docker and then start without building:
> `docker build -f apps/api/Dockerfile -t coworkai-api . && docker build -f apps/web/Dockerfile -t coworkai-web .`
> then `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-build`.

### Gmail SMTP for verification emails

1. Turn on 2-Step Verification on the Gmail account that will send emails.
2. Create an **App Password** at https://myaccount.google.com/apppasswords.
3. Set `SMTP_USER=<that gmail>`, `SMTP_PASS=<16-character app password>`, `MAIL_FROM="CoworkAI <that gmail>"`.

---

## How the main flows work

**Signup → verify → trial.** Signup creates the account and emails a verification link (valid 24 h). The account
can't log in until it's verified. Verifying starts the 24-hour trial and signs the user in. "Resend" and
"Forgot password" are built in. Admins can also "Mark email verified" in Admin → Users.

**Google with the tenant's own credentials.** Each business creates an OAuth client in Google Cloud Console (Web
application), adds the redirect URI shown on the Integrations page
(`https://coworkai.axxeler.in/api/integrations/google/callback`), and pastes the Client ID and Secret. They pick
services (Sheets, Calendar, Gmail, Drive, Docs) and click Connect. Refresh tokens are stored encrypted. The OAuth
`state` is a signed 10-minute token bound to the tenant. Google apps left in "Testing" mode expire tokens after 7
days, and the UI tells users to publish the app.

**Sheets in the agent.** Agent Config → Google Sheets: add a _lookup_ sheet (price list, stock, menu). The agent gets
a `read_sheet` tool and reads live rows. Add a _leads_ sheet and every captured lead is appended as a row.

**Payments are on hold.** `BILLING_ENABLED=false` (default). Upgrade buttons open WhatsApp to +91 81480 35472, and
admins change plans manually in Admin → Users. The Razorpay code stays in place: set the `RAZORPAY_*` values and
`BILLING_ENABLED=true` when you're ready.

**Landing page contact form.** Opens WhatsApp to 8148035472 with the enquiry pre-filled, and stores a copy in
Admin → Contact Messages.

## Security summary

- AES-256-GCM for AI keys, bot tokens, Google client secrets and refresh tokens. They are never returned to the browser.
- httpOnly cookie sessions: 15-minute JWT plus rotating refresh tokens with reuse detection, double-submit CSRF, and
  SameSite=Lax.
- Every tenant query is forced through `tenantDb(userId)`. Isolation is covered by tests.
- Webhooks are verified: Telegram secret token, Meta `X-Hub-Signature-256`, Razorpay signature. Auth, email and
  webhook routes are rate-limited.
- Email verification and reset tokens are single-use and stored hashed. Resend and forgot-password never reveal
  whether an account exists.
- Admin actions are written to the audit log.
