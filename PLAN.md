# partner.ai — Build Plan

Multi-tenant SaaS: business owners create an AI agent, give it knowledge + skills, bring their own
AI key, and connect it to Telegram and WhatsApp.

## Important starting note

The brief said this folder already contained a Fastify/Prisma backend scaffold. **The folder was empty**
(no scaffold was found anywhere on the drive), so `apps/api` is written fresh, following the scaffold
description in the brief: Fastify + TypeScript + Prisma + Postgres, JWT auth, admin API, Telegram webhooks,
Baileys QR, Composio integrations, BYOK replies. If the original scaffold turns up, pieces of it can be merged in.

## Architecture

```
apps/
  api/      Fastify 5 (ESM, TS strict) — REST API, webhooks, pg-boss workers, Baileys session manager
  web/      Next.js 16 App Router — tenant dashboard + /admin. Tailwind v4, shadcn-style UI, TanStack Query
packages/
  shared/   zod schemas, plan limits, provider/model catalog, shared types (used by api + web)
docker-compose.yml   db (postgres:16) · api · web   (+ named volumes for pg data and WhatsApp sessions)
```

- **Same-origin web ↔ api.** The browser only talks to the web origin; Next rewrites `/api/*` to the API
  service (`API_INTERNAL_URL`). Cookies stay first-party and SameSite=Lax works. The API is also exposed publicly
  (for Telegram / Meta / Razorpay webhooks), and CORS is locked to `WEB_ORIGIN`.
- **Sessions:** short-lived JWT access token (15 min) in an httpOnly cookie + opaque rotating refresh token
  (30 days, stored hashed, reuse detection revokes the family). CSRF uses a double-submit token
  (`pa_csrf` cookie + `x-csrf-token` header) on every cookie-authenticated mutating request.
  `Authorization: Bearer` is also accepted (for tests and API clients). Bearer requests need no CSRF token.
- **Tenancy:** every tenant-owned table has `userId`. `tenantDb(userId)` is a Prisma client extension that
  injects `userId` into every where/data for tenant models; route handlers only receive the scoped client.
- **Queue:** pg-boss (Postgres-backed, so no Redis). Inbound messages are stored first with a unique
  `dedupeKey` (channel + provider message id). Duplicate webhooks are dropped at insert time, and the job
  is keyed by message id (`singletonKey`) so processing is idempotent. Jobs retry with exponential backoff.
- **LLM layer:** one internal OpenAI-style chat + tool-call format, with adapters for: OpenAI-compatible
  (OpenAI, Groq, OpenRouter, DeepSeek, Mistral), Anthropic Messages API, and Google Gemini `generateContent`.
  It is plain `fetch`, so there are no vendor SDKs.
- **Agent:** system prompt = personality + knowledge base + enabled skill fragments + customer memory.
  The tool loop runs at most 5 rounds. Tools: `book_appointment`, `capture_lead`, `send_email`, `search_drive`, `read_doc`.
  Connected-app tools run through Composio with `userId` as the Composio user/entity.
- **Secrets:** AES-256-GCM (`ENCRYPTION_KEY`, 32-byte hex). Secrets are never returned to the client
  (only `last4`), and pino redaction is applied to logs.

## Data model (Prisma)

User(role USER|ADMIN, status ACTIVE|SUSPENDED, plan TRIAL|STARTER|GROWTH, trialEndsAt, subscription fields,
bossNumbers[]) · RefreshToken · Agent (1:1 user — personality + knowledge base + active provider/model) ·
ApiKey (per provider, encrypted) · Skill (slug, category, promptFragment, tools[], isPublic, authorId) ·
UserSkill · Channel (TELEGRAM | WHATSAPP_QR | WHATSAPP_CLOUD, encrypted config, status) · Contact
(profile JSON = learned facts, summary) · Conversation (summary, summarizedAt) · Message (dedupeKey unique,
direction, tokens) · Appointment · Lead · Integration (Composio connected account per toolkit) ·
IntegrationRequest · Schedule · EventLog (tenant-visible logs + errors) · AuditLog (admin actions) ·
FeatureFlag · BillingEvent (Razorpay event id unique → idempotent webhooks).

## Plans (assumptions, editable in `packages/shared/src/plans.ts`)

| Plan    | Price       | Channels | WhatsApp QR sessions | Messages / month | Enabled skills |
| ------- | ----------- | -------- | -------------------- | ---------------- | -------------- |
| Trial   | free, 24 h  | 2        | 1                    | 200              | 10             |
| Starter | ₹999 / mo   | 3        | 1                    | 5,000            | 20             |
| Growth  | ₹2,999 / mo | 10       | 3                    | 30,000           | unlimited      |

When a trial expires or a subscription halts, the agent stops replying (the message is logged as
`plan_inactive`) and the dashboard shows an upgrade prompt.

## Phases

- (a) Monorepo restructure + shared package + Prisma schema/migrations
- (b) Auth (cookies, refresh, CSRF) + tenant scoping + isolation tests
- (c) Web shell + design system + dashboard
- (d) Agent config, skills (seeded ~40), knowledge base, API keys, skill creator
- (e) Channels (Telegram, Baileys, Cloud API) + pg-boss queue + messaging pipeline + Boss Mode
- (f) Tool calling + Composio
- (g) Memory / Learning
- (h) Razorpay billing + plan enforcement + trial expiry
- (i) Admin panel
- (j) Hardening, tests (Vitest + Playwright), Docker, Dokploy docs

## Assumptions & uncertainties

- **Composio** (`@composio/core` 0.31): `connectedAccounts.initiate()` is retired for Composio-managed OAuth
  (2026 cutover), so we use `connectedAccounts.link(userId, authConfigId, { callbackUrl })`. Direct
  `tools.execute` requires a toolkit version, so we pass `dangerouslySkipVersionCheck` unless
  `COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>` env vars pin one. One auth config per Google toolkit is expected in
  env (`COMPOSIO_AUTH_CONFIG_GMAIL`, …), created as "Composio managed" in the Composio dashboard.
  Tool slugs and argument names are checked against the installed SDK where possible. Where they cannot be
  verified, they live in one file (`apps/api/src/integrations/composio-tools.ts`) for easy correction.
- **Baileys** 7.0.0-rc (unofficial). Sessions are stored on a volume via `useMultiFileAuthState` (one dir per
  channel). Numbers can be banned, and the UI warns about this and recommends the Cloud API.
- **WhatsApp Cloud API**: the Graph version is configurable (`WA_GRAPH_VERSION`). The typing indicator
  (`typing_indicator` on the read receipt) is best-effort.
- **Razorpay**: plans are created in the Razorpay dashboard and their ids are set in env. Checkout uses the
  subscription `short_url`. Webhooks are verified with HMAC-SHA256 over the raw body using the webhook secret.
- "Time saved" = bot replies × 2 min; "money saved" = hours saved × ₹200/h (configurable in shared constants).
- Model price hints are approximate and labelled as such in the UI. A custom model id can always be typed.

## Status (2026-11-21)

All phases (a)–(j) are implemented and committed. 46 API tests pass (Vitest), and there is a Playwright suite for the
main flows. Lint and typecheck are clean, and `docker compose up` brings up db + api + web with healthy checks.

Additional notes discovered while building:
* `prisma migrate reset` is blocked by Prisma's AI-agent guard. Tests therefore use `migrate deploy` against a
  dedicated `partner_test` database, with unique users per test (no destructive resets).
* Docker Desktop's BuildKit may ask for an `fs.read` entitlement under `docker compose build`. Plain `docker build`
  works (README has the commands). Dokploy builds on Linux and is not affected as far as we know.
* Dokploy network wiring for Compose domains differs between versions. Check the current Dokploy docs.
* Memory upkeep LLM calls are stored as `SYSTEM` messages (`[memory] …`) so token usage stays accounted.
  They are hidden from the inbox and excluded from message counts.
* When customers send several messages quickly, only the newest one is answered (with all of them in context).
  The others are marked `SKIPPED: merged_into_newer_message`.
