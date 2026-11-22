# CoworkAI

**Your AI co-worker for WhatsApp & Telegram** — https://coworkai.zenautomations.in

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

### With Docker → http://localhost:3000 (`docker-compose.yml`)

```bash
docker compose up -d --build
```

Same image as production but without Caddy: the app is on **port 3000**, Postgres on 5433. It works with no `.env` (dev secrets are built in).
Admin: `admin@cowork.local` / `ChangeMe123!`. With no SMTP configured, verification emails are printed by `docker compose logs app` (open the link from there).

**Production** uses `docker-compose.prod.yml` with Caddy on **port 8080** (below).

### Without Docker

Node on your machine, Postgres in a throwaway container:

```bash
npm install
cp .env.example .env              # fill JWT_SECRET + ENCRYPTION_KEY (commands are in the file)
docker run -d --name cowork-db -e POSTGRES_USER=cowork -e POSTGRES_PASSWORD=cowork -e POSTGRES_DB=cowork -p 127.0.0.1:5433:5432 postgres:16-alpine
npm run build:shared
npm run db:deploy                 # apply migrations
npm run dev:api                   # http://localhost:4000 (seeds 40 skills + admin on boot)
npm run dev:web                   # http://localhost:3000
```

Without SMTP settings in development, verification emails are printed in the API log.

## Tests

```bash
npm test                          # Vitest (needs the Postgres above; uses database cowork_test)
npm run lint && npm run typecheck
ADMIN_EMAIL=… ADMIN_PASSWORD=… E2E_BASE_URL=http://localhost:8080 npm run test:e2e
```

> Windows: run Vitest from an upper-case drive path (`D:\…`), otherwise Vitest loads twice.

---

## Production — one compose file: `docker-compose.prod.yml`

Built for a **1 vCPU / 2 GB KVM VPS**:

| Container | What                                                                               | Memory limit |
| --------- | ---------------------------------------------------------------------------------- | ------------ |
| `db`      | Postgres 16, tuned for low memory                                                  | 320 MB       |
| `app`     | API + web in **one** image/container (`Dockerfile`, started by `docker/start.mjs`) | 900 MB       |
| `caddy`   | Reverse proxy, the only published port: **8080**                                   | 64 MB        |

Idle usage is about 300 MB in total. The image is built **once** (one `npm ci`), Next.js builds with a single
worker and capped memory, and type-checking is skipped in the image build (CI does it), so the build fits the VPS.

```bash
cp .env.example .env.production   # fill it in
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

**Before the first deploy on a 1-core VPS, add swap.** The build needs about 1.5 GB of memory at peak, and without
swap it can be killed, which shows up as a cancelled deploy:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

The first build takes about 8–15 minutes on 1 vCPU. In Dokploy, raise the build timeout if it is set lower.

### Deploying with Dokploy

1. DNS: an `A` record for `coworkai.zenautomations.in` pointing at the VPS.
2. Dokploy → **Create Service → Compose** → repo `aiwithsalman33/cowork.ai`, branch `main`, compose path
   **`./docker-compose.prod.yml`**.
3. **Environment**: `APP_URL=https://coworkai.zenautomations.in`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
4. **Domains**: `coworkai.zenautomations.in` → service **caddy**, port **8080**, HTTPS on.
5. Deploy. On start the app runs migrations, seeds skills and flags, and creates the admin. The database starts
   empty otherwise, with no demo data.

Health: `GET /health/ready` (API) and `GET /web-health` (web), both through Caddy.

### Gmail SMTP for verification emails

1. Turn on 2-Step Verification on the Gmail account that sends emails.
2. Create an **App Password** at https://myaccount.google.com/apppasswords.
3. Set `SMTP_USER=<that gmail>`, `SMTP_PASS=<16-character app password>`, `MAIL_FROM="CoWork AI <that gmail>"`.

---

## How the main flows work

**Signup → verify → trial.** Signup creates the account and emails a verification link (valid 24 h). The account
can't log in until it's verified. Verifying starts the 24-hour trial and signs the user in. "Resend" and
"Forgot password" are built in. Admins can also "Mark email verified" in Admin → Users.

**Google with the tenant's own credentials.** Each business creates an OAuth client in Google Cloud Console (Web
application), adds the redirect URI shown on the Integrations page
(`https://coworkai.zenautomations.in/api/integrations/google/callback`), and pastes the Client ID and Secret. They pick
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
