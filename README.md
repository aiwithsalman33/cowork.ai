# partner.ai

Multi-tenant SaaS where business owners create an AI agent, teach it their business, bring their own AI
key, and connect it to **WhatsApp** (official Cloud API or QR) and **Telegram**.

- **apps/api**: Fastify 5 + TypeScript + Prisma/Postgres, pg-boss queue, Baileys, Composio, Razorpay
- **apps/web**: Next.js 16 (App Router) + Tailwind v4 + shadcn-style UI + TanStack Query
- **packages/shared**: zod schemas, plan limits, AI provider catalogue (used by both)

See [PLAN.md](PLAN.md) for the architecture, data model and assumptions.

---

## Quick start (local)

Requirements: Node ≥ 22.22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env            # then fill JWT_SECRET and ENCRYPTION_KEY (commands are in the file)
docker compose up -d db         # Postgres on localhost:5433
pnpm --filter @partner/shared build
pnpm --filter @partner/api prisma:deploy   # or prisma:migrate in development
pnpm dev:api                    # http://localhost:4000  (seeds skills + admin on boot)
pnpm dev:web                    # http://localhost:3000
```

Sign up at http://localhost:3000/signup (24-hour trial starts immediately), or log in with
`ADMIN_EMAIL` / `ADMIN_PASSWORD` to reach `/admin`.

### Everything in Docker

```bash
docker compose up -d --build    # db + api + web, all with health checks
```

> On some Docker Desktop versions `docker compose build` asks for an extra BuildKit
> `fs.read` entitlement. If you see “additional privileges requested”, build with plain Docker instead:
> `docker build -f apps/api/Dockerfile -t partner-ai-api . && docker build -f apps/web/Dockerfile -t partner-ai-web .`
> then run `docker compose up -d --no-build`.

## Tests

```bash
docker compose up -d db
pnpm test                       # Vitest: auth, tenant isolation, plan limits, prompt composition,
                                # webhook pipeline, tool calling, Boss Mode, billing, admin (uses DB partner_test)
docker compose up -d --build    # E2E needs the full stack
ADMIN_EMAIL=… ADMIN_PASSWORD=… pnpm test:e2e     # Playwright
pnpm lint && pnpm typecheck
```

---

## Deploying on a VPS with Dokploy

Dokploy runs Docker Compose apps behind Traefik with automatic HTTPS.

1. **Point DNS** at the VPS: `app.example.com` (dashboard) and `api.example.com` (webhooks).
2. In Dokploy: **Create Project → Add Service → Compose**. Choose *Git* as the source, select this
   repository and branch, and keep the compose path as `./docker-compose.yml`.
3. **Environment** tab: paste `.env.example` and fill it in. At minimum:
   - `POSTGRES_PASSWORD`: a long random string
   - `JWT_SECRET`, `ENCRYPTION_KEY`: generate with the commands in `.env.example`.
     **Back up `ENCRYPTION_KEY`.** Losing it makes every stored API key and channel token unreadable.
   - `WEB_ORIGIN=https://app.example.com`, `PUBLIC_API_URL=https://api.example.com`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`: the first admin is created on boot
   - Keep containers off the public host ports so traffic only enters through Traefik:
     `DB_PORT_PUBLISH=127.0.0.1:5433`, `API_PORT_PUBLISH=127.0.0.1:4000`, `WEB_PORT_PUBLISH=127.0.0.1:3000`.
     Dokploy's Domains feature attaches the services to its Traefik network itself. Verify this against your
     Dokploy version's Compose docs: older versions need `dokploy-network` declared as an external network.
4. **Domains** tab:
   - `app.example.com` → service **web**, port **3000**, HTTPS on
   - `api.example.com` → service **api**, port **4000**, HTTPS on (Telegram, Meta and Razorpay webhooks go here)
5. **Deploy**. On start the api runs `prisma migrate deploy`, seeds the 40 skills and feature flags, creates the
   admin, and restores WhatsApp QR sessions from the `wa_sessions` volume.
6. Health checks: `GET /health/ready` (api) and `GET /api/health` (web). Dokploy waits for them.

**Proxy / IP settings:** `TRUST_PROXY=2` (default) trusts Traefik plus the Next.js rewrite hop, so rate limits key
on the real client IP. If you put Cloudflare in front, use `3`.

**Scaling note:** run **one** api replica. Baileys keeps a live WebSocket per WhatsApp QR session and two
processes must never share a session folder. The queue (pg-boss) is safe across replicas, but the QR sessions are not.

**Backups:** back up the `pgdata` volume (or `pg_dump`) and the `wa_sessions` volume.

### Third-party setup

| Service | What to do |
|---|---|
| **Telegram** | Nothing server-side. Users paste a @BotFather token, and the api calls `setWebhook` with a secret token. `PUBLIC_API_URL` must be public HTTPS. |
| **WhatsApp Cloud API** | Each tenant creates a Meta app, adds WhatsApp, and pastes their Phone number ID, permanent access token and app secret. The UI then shows a per-channel Callback URL + Verify token to paste into Meta → WhatsApp → Configuration. They must subscribe to `messages`. |
| **WhatsApp QR (Baileys)** | Works out of the box. It is unofficial and numbers can be banned, and the UI says so. Disable it globally with `BAILEYS_ENABLED=false` or the `whatsapp_qr` feature flag. |
| **Composio** (Google apps) | Create a Composio project, then create one **Composio-managed** auth config each for Gmail, Google Calendar, Google Sheets, Google Drive and Google Docs, and put the ids in `COMPOSIO_AUTH_CONFIG_*`. No Google Cloud Console needed. Then open **Admin → Overview → Verify Composio tools** to confirm tool slugs and arguments against the live schemas. |
| **Razorpay** | Dashboard → Subscriptions → Plans: create a ₹999/month (Starter) and a ₹2,999/month (Growth) plan and set `RAZORPAY_PLAN_*`. Dashboard → Webhooks: URL `https://api.example.com/webhooks/razorpay`, set a secret (`RAZORPAY_WEBHOOK_SECRET`), and enable the `subscription.*` events. |

---

## Security summary

- Secrets (AI keys, bot tokens, Cloud API credentials) are encrypted with AES-256-GCM and never returned to the client.
  Only the last 4 characters are shown. Logs redact auth headers, cookies, signatures and secret fields.
- httpOnly cookie sessions: 15-minute JWT plus 30-day rotating refresh tokens with reuse detection. Double-submit
  CSRF token, SameSite=Lax, and CORS locked to `WEB_ORIGIN`.
- Every tenant query goes through `tenantDb(userId)` (a Prisma extension that forces `userId`). Tests prove
  cross-tenant reads, updates and deletes fail.
- Webhooks are verified: Telegram secret token, Meta `X-Hub-Signature-256`, Razorpay `X-Razorpay-Signature` (all on
  the raw body, constant-time compare). There are rate limits on auth, webhooks and globally.
- Every admin action (plan changes, impersonation, suspensions, deletions, skill and flag edits) is written to the
  audit log.
