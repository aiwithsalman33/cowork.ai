# CoWork AI — Application Reference

AI co-worker that answers a business's customers on **WhatsApp and Telegram** 24×7: it uses the business's knowledge base, books appointments, captures leads, sends WhatsApp templates and remembers customers. Multi-tenant SaaS with a free trial, paid plans (Cashfree) and an admin panel.

- Production: `https://coworkai.zenautomations.in`
- Repository layout: npm workspaces monorepo

```
apps/api        Fastify API, workers, WhatsApp sockets, Prisma (PostgreSQL)
apps/web        Next.js 16 (App Router) web app: landing, auth, tenant app, admin
packages/shared Types, zod schemas, plan defaults, brand, provider list (used by both)
docker/         Caddyfile, start.mjs (container entrypoint)
docs/           This file
```

---

## 1. Architecture

```
Browser ──HTTPS──► Dokploy/Traefik (TLS) ──► Caddy :8080 ──┬─► web  (Next.js) :3000
                                                          └─► api  (Fastify) :4000
                                                                │  /api/*, /webhooks/*, /health
Telegram ──webhook──► /webhooks/telegram/:channelId ────────────┤
Meta (WhatsApp Cloud) ──webhook──► /webhooks/whatsapp/:id ──────┤
Cashfree ──webhook──► /webhooks/cashfree ───────────────────────┤
WhatsApp Web (Baileys socket, outbound) ◄───────────────────────┤
                                                                ▼
                                    PostgreSQL 16 (app data + pg-boss queue schema "pgboss")
```

- **One container** runs migrations, then the API and the web server (`docker/start.mjs`). If either exits, the container restarts.
- The browser only talks to the web origin. Next.js rewrites `/api/*` to the API, so auth cookies stay first-party.
- **Background work** (same API process): pg-boss queues `inbound-message`, `summarize-conversation`, `minute-tick` (schedules); WhatsApp QR sockets; plan-settings refresh every 60 s.
- Must run as **a single API replica** (WhatsApp QR sessions are files on a volume and one socket per number).

### Tech stack
| Area | Choice |
|---|---|
| API | Node 24, Fastify 5, Prisma 6, zod, pg-boss 12 |
| Web | Next.js 16, React 19, Tailwind CSS 4, TanStack Query, Radix UI, lucide icons |
| DB | PostgreSQL 16 |
| WhatsApp | Meta Cloud API (official) and Baileys 7 (WhatsApp Web via QR, unofficial) |
| Telegram | Bot API webhooks |
| AI | Bring-your-own key: OpenAI, Anthropic, Google, Groq, OpenRouter, DeepSeek, Mistral |
| Payments | Cashfree Payment Gateway (one-time payment per plan period) |
| Email | SMTP (Gmail app password) via nodemailer |
| Deploy | GitHub Actions builds the image → GHCR (public) → Dokploy pulls; Caddy + Traefik |

---

## 2. Users, plans and access

### Roles
- **USER** — a business (tenant). All data is scoped to the user.
- **ADMIN** — platform owner. Sees `/admin`, can impersonate users. Seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Account lifecycle
1. **Sign up** (`POST /api/auth/signup`): account is created ready to use (email marked verified, approved), plan `TRIAL`, `trialEndsAt = now + trial days`. Default skills are enabled and an empty Agent is created. The admin gets an email if `ADMIN_EMAIL` and SMTP are set.
2. **Sign in** with the same email and password.
3. During the trial only the channels allowed by the Trial plan can be connected (default: Telegram).
4. After the trial, the agent stops replying until the user **buys a plan** (Billing → Cashfree), or an admin changes the plan.
5. Admins can suspend, delete, change plan, extend a trial, or impersonate.

### Plans
Defaults live in `packages/shared/src/plans.ts`; **admins edit them in Admin → Plans & pricing** (saved in `PlanSetting`, applied within 60 s).

| Plan | Default price | Days | Default limits |
|---|---|---|---|
| TRIAL | ₹0 | 7 | 1 channel (Telegram), 300 AI replies, 10 skills |
| STARTER | ₹499 | 30 | 3 channels (Telegram + WhatsApp QR), 1 QR number, 3,000 replies/month, 20 skills |
| GROWTH | ₹999 | 30 | 10 channels (all types incl. WhatsApp Business API), 3 QR numbers, 20,000 replies/month, unlimited skills, WhatsApp templates |

Editable per plan: name, tagline, price, days, "most popular", features list, and limits (`channels`, `whatsappSessions`, `messagesPerMonth`, `skills`, `channelTypes`, `templates`). `null` = unlimited.

### When does the agent reply? (`services/plan.ts → canReply`)
`status = ACTIVE` **and** approved **and** plan active (trial not expired, or `currentPeriodEnd > now`) **and** agent not paused **and** channel AI switch on **and** monthly AI replies below the limit **and** an AI key is configured.

---

## 3. End-to-end flows

### 3.1 Inbound message → AI reply
```
Telegram / Meta webhook  or  Baileys socket event
  → normalise (text, sender, name, phone, provider message id)
  → ingestInbound(): upsert Contact + Conversation, insert Message(IN, RECEIVED)
       dedupeKey = "<type>:<channelId>:<providerMsgId>"  (drops retries/duplicates)
  → enqueue "inbound-message"
worker processInbound():
  → skip if already finished / reply already SENT
  → owner number? → Boss Mode command, reply as SYSTEM
  → newer message from same customer? → skip (newest answers all)
  → channel aiEnabled? plan/limits/pause? AI key?  (else SKIPPED + EventLog explains why)
  → typing indicator
  → runAgent(): system prompt (agent personality + knowledge base + enabled skills
                + customer memory + tools) + last 16 messages
                → model call → tool calls (max 5 rounds) → final text
  → recordOutbound(): Message(OUT, ASSISTANT) → send via channel → SENT / FAILED(error)
  → maybe enqueue "summarize-conversation" (memory)
```
Retries: up to 4 attempts with backoff for retryable errors; then FAILED + `reply.failed` log.

### 3.2 Agent tools
| Tool | Needs | Effect |
|---|---|---|
| `book_appointment` | skill | Appointment row; Google Calendar event if connected |
| `capture_lead` | skill | Lead row; appended to the LEADS Google Sheet if set |
| `send_email` | Gmail connected | Sends from the tenant's Gmail |
| `search_drive`, `read_doc` | Drive/Docs connected | Read the tenant's files |
| `read_sheet` | LOOKUP sheet | Searches rows (prices, stock…) |
| `send_whatsapp_template` | Growth + Cloud API channel + approved templates marked "AI bot" | Sends a template to the customer |

### 3.3 Customer memory
- `Contact.profile` (JSON facts) and `Contact.summary` are refreshed every 8 customer messages.
- Long threads: after 24 unsummarised messages, older ones are compressed into `Conversation.summary`; `summarizedUntil` marks the cut. The agent then loads only newer messages.
- Shown in **Learning** and in the chat side panel.

### 3.4 Owner actions from the inbox (Conversations)
- **Reply** as the owner (`POST /api/conversations/:id/reply`) → Message role OWNER.
- **Send template** in a chat (`POST /api/conversations/:id/template`) — Cloud API, Growth.
- **New message** to a number with no chat yet (`POST /api/conversations/start`) — template only (WhatsApp rule). 10-digit numbers are treated as Indian (+91).
- Failed sends show "Not delivered" with the reason. Meta's later failure reports (status webhooks) mark the message FAILED.
- 24-hour rule: if the customer's last message is older than 24 h, only templates are delivered (UI warns).

### 3.5 Channels (Integrations → Channels)
| Type | Connect | Inbound | Outbound |
|---|---|---|---|
| TELEGRAM | Paste BotFather token → app calls `setWebhook` (secret token header) | `/webhooks/telegram/:channelId` | Bot API `sendMessage` |
| WHATSAPP_CLOUD | Phone number ID, WABA ID, permanent access token, app secret → paste callback URL + verify token in Meta, subscribe to `messages` | `/webhooks/whatsapp/:channelId` (HMAC `X-Hub-Signature-256`) | Graph API `/{phone-number-id}/messages` |
| WHATSAPP_QR | Scan QR (Baileys) | socket `messages.upsert` | socket `sendMessage` |

- Per-channel **AI bot replies** switch (`Channel.aiEnabled`): when off, messages are saved but not answered.
- QR sessions auto-reconnect (backoff, then every 5 min); logged-out sessions are wiped.

### 3.6 WhatsApp templates (Growth)
Integrations → Channels → **Templates**: enter WABA ID once → **Sync from Meta** (also subscribes the app to the WABA webhooks) → templates stored in `WhatsAppTemplate`. **New template** submits to Meta for review. Sending supports text values (numbered `{{1}}` or named `{{customer_name}}`), media headers (image/video/document link), URL-button suffixes, coupon codes. Carousel, LTO, Flow and catalog templates are not supported.

### 3.7 Payments (Cashfree)
```
Billing → "Buy <plan>" → enter 10-digit mobile
  POST /api/billing/checkout {plan, phone}
    → Payment(CREATED, amount, days) ; Cashfree POST /pg/orders
    → returns payment_session_id
  Browser loads https://sdk.cashfree.com/js/v3/cashfree.js → checkout(redirect)
  Customer pays → Cashfree redirects to /billing?order_id=…
Confirmation (whichever comes first, applied exactly once):
  a) Webhook POST /webhooks/cashfree (PAYMENT_SUCCESS_WEBHOOK, signature verified)
  b) Return page polls GET /api/billing/orders/:orderId → Cashfree GET /pg/orders/:id → PAID
applyPaidOrder():
  amount must match → Payment PAID → user.plan = plan,
  currentPeriodEnd = (same active plan ? old end : now) + days, subscriptionStatus "paid"
```
One-time payments; nothing renews automatically. Failed/abandoned → Payment FAILED. Env: `BILLING_ENABLED`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`sandbox`|`production`), `CASHFREE_API_VERSION`.
(Legacy Razorpay webhook code is kept but no longer used for checkout.)

### 3.8 Boss Mode
Owner numbers (Agent Config) message the agent: `stats`, `info: …`, `product: …`, `faq: q | a`, `leads`, `appointments`, `pause`, `resume`, or plain language.

### 3.9 Schedules
Scheduled messages (once / daily / weekly) per channel and recipient; the minute tick sends due ones (skipped if the plan is inactive).

### 3.10 Google integration
Tenant uses **their own** Google Cloud OAuth client (Integrations → Google): Gmail, Calendar, Sheets, Drive, Docs. Refresh token stored encrypted. Sheets can be attached as LEADS (append) or LOOKUP (read).

---

## 4. Security
- **Auth**: argon2id password hash (`auth/password.ts`), 15-minute access JWT cookie `pa_at` (httpOnly), rotating 30-day refresh token `pa_rt` (httpOnly, path `/api/auth`, single use, reuse revokes the family), CSRF double-submit cookie `pa_csrf` + `x-csrf-token` header.
- Web client refreshes once at a time across tabs (Web Locks) and only signs out on a real 401.
- **Tenant isolation**: request handlers use `req.db` (`db/tenant.ts`), which forces `userId` on every query of tenant models.
- **Encryption at rest** (AES, `ENCRYPTION_KEY`): AI keys, channel credentials, Google credentials/tokens.
- **Webhooks** verified: Telegram secret token, Meta HMAC-SHA256 (app secret), Cashfree Base64 HMAC-SHA256 (timestamp + body, client secret).
- Rate limits (global 600/min/IP, stricter on auth, webhooks per channel), helmet headers, HSTS (Caddy), admin audit log.

---

## 5. Database structure (PostgreSQL via Prisma)

Schema: `apps/api/prisma/schema.prisma`. Migrations: `apps/api/prisma/migrations/` (applied on container start with `prisma migrate deploy`). IDs are `cuid` strings. Tenant-owned tables have `userId` and cascade-delete with the user.

### 5.1 Enums
| Enum | Values |
|---|---|
| Role | USER, ADMIN |
| UserStatus | ACTIVE, SUSPENDED |
| Plan | TRIAL, STARTER, GROWTH |
| ChannelType | TELEGRAM, WHATSAPP_QR, WHATSAPP_CLOUD |
| ChannelStatus | DISCONNECTED, CONNECTING, QR, CONNECTED, ERROR |
| Direction | IN, OUT |
| MessageRole | USER, ASSISTANT, OWNER, SYSTEM |
| MessageStatus | RECEIVED, PROCESSING, REPLIED, SKIPPED, FAILED, SENT |
| AppointmentStatus | CONFIRMED, CANCELLED, COMPLETED, NO_SHOW |
| IntegrationStatus | PENDING, CONNECTED, DISCONNECTED, ERROR |
| Frequency | ONCE, DAILY, WEEKLY |
| LogLevel | INFO, WARN, ERROR |
| SheetPurpose | LEADS, LOOKUP |
| EmailTokenType | VERIFY_EMAIL, RESET_PASSWORD |

### 5.2 Relationships
```
User 1─1 Agent
User 1─1 GoogleConnection
User 1─* RefreshToken, ApiKey, UserSkill, Channel, Contact, Conversation, Message,
         Appointment, Lead, AgentSheet, EmailToken, IntegrationRequest, Schedule,
         EventLog, BillingEvent, Payment, WhatsAppTemplate, Skill(author), AuditLog(actor)
Skill 1─* UserSkill
Channel 1─* Conversation, Schedule, WhatsAppTemplate
Contact 1─* Conversation, Appointment, Lead
Conversation 1─* Message           (one conversation per channel + contact)
```

### 5.3 Tables

**User** — account, plan and billing state
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| email | text unique | |
| passwordHash | text | |
| emailVerifiedAt | timestamp? | set at signup |
| approvedAt | timestamp? | null = on hold (blocks the app) |
| name | text | |
| role | Role | default USER |
| status | UserStatus | default ACTIVE |
| plan | Plan | default TRIAL |
| trialEndsAt | timestamp? | |
| currentPeriodEnd | timestamp? | paid access until |
| subscriptionStatus | text? | "paid" after Cashfree; legacy Razorpay values |
| pendingPlan | Plan? | legacy |
| razorpayCustomerId / razorpaySubscriptionId | text? | legacy |
| bossNumbers | text[] | owner phone numbers |
| lastLoginAt, createdAt, updatedAt | timestamp | |

**RefreshToken** — `id, userId, family, tokenHash (unique), expiresAt, revokedAt?, impersonatorId?, userAgent?, ip?, createdAt`. Index userId, family.

**EmailToken** — `id, userId, type (EmailTokenType), tokenHash unique, expiresAt, usedAt?, createdAt` (password reset; legacy verification).

**Agent** (1 per user) — personality and knowledge base
`name, businessName, tone, language, greeting, instructions, emojis (bool), replyLength, isActive (pause switch), customized, businessDetails, productsServices, commonQuestions, provider?, model?, createdAt, updatedAt`.

**ApiKey** — `id, userId, provider, model, encryptedKey, last4, createdAt, updatedAt`. Unique (userId, provider).

**Skill** — skill library: `slug unique, name, description, category, icon, promptFragment, tools text[], isPublic, isBuiltin, authorId?`. 41 built-in skills seeded from `db/skills-catalog.ts`.

**UserSkill** — `userId, skillId, enabled`. Unique (userId, skillId).

**Channel** — `id, userId, type, name, status, encryptedConfig? (token / Meta credentials), webhookSecret (Telegram secret / Meta verify token), externalId? (bot @name / phone), lastError?, aiEnabled (default true), connectedAt?, createdAt, updatedAt`. Index userId, (type,status).

**Contact** — customer per channel type: `userId, channelType, externalId (chat id / wa id / jid), name?, phone?, profile JSON, summary, messageCount, firstSeenAt, lastSeenAt, updatedAt`. Unique (userId, channelType, externalId).

**Conversation** — `userId, channelId, contactId, summary, summarizedUntil?, lastMessageAt, lastMessage?, messageCount, createdAt`. Unique (channelId, contactId). Index (userId, lastMessageAt).

**Message**
| Column | Type | Notes |
|---|---|---|
| direction | Direction | IN / OUT |
| role | MessageRole | USER (customer), ASSISTANT (AI), OWNER (you), SYSTEM (boss mode) |
| content | text | templates stored as rendered text |
| dedupeKey | text? unique | inbound idempotency |
| externalId | text? | provider message id (wamid, Telegram id) |
| status | MessageStatus | IN: RECEIVED→PROCESSING→REPLIED/SKIPPED/FAILED; OUT: PROCESSING→SENT/FAILED |
| error | text? | skip reason or delivery error |
| tokensIn / tokensOut | int | AI usage |
| toolCalls | JSON? | `[{name, ok}]` |
| replyToId | text? | outbound reply → inbound id |
| processedAt, createdAt | timestamp | |
Index (conversationId, createdAt), (userId, createdAt).

**Appointment** — `userId, contactId?, customerName, customerPhone?, customerEmail?, title, notes?, startsAt, endsAt, status, googleEventId?, createdAt`.

**Lead** — `userId, contactId?, name, phone?, email?, interest?, notes?, syncedToSheet, createdAt`.

**GoogleConnection** (1 per user) — `encryptedCredentials?, clientIdHint?, encryptedRefreshToken?, email?, scopes text[], status, settings JSON (calendarId), lastError?, connectedAt?`.

**AgentSheet** — `userId, spreadsheetId, tab?, name, description, purpose (LEADS|LOOKUP), title, createdAt`. Unique (userId, name).

**WhatsAppTemplate** — `userId, channelId, metaId?, name, language, category, status (APPROVED|PENDING|REJECTED|PAUSED|DISABLED), header?, body, footer?, variables (count of values needed), components JSON (Meta definition), useInAi, aiHint, syncedAt, createdAt, updatedAt`. Unique (channelId, name, language).

**Schedule** — `userId, channelId, name, recipient, message, frequency, nextRunAt, lastRunAt?, lastError?, enabled, createdAt`. Index (enabled, nextRunAt).

**Payment** — one Cashfree order
| Column | Type | Notes |
|---|---|---|
| orderId | text unique | `cw_<time>_<random>` sent to Cashfree |
| plan | Plan | |
| amountInr | int | price at purchase time |
| durationDays | int | days granted |
| status | text | CREATED, PAID, FAILED |
| cfPaymentId | text? | Cashfree payment id |
| error | text? | |
| paidAt, createdAt | timestamp | |

**PlanSetting** — admin overrides: `plan (PK: TRIAL|STARTER|GROWTH), data JSON (PlanJSON), updatedAt`.

**FeatureFlag** — `key unique, description, enabled, plans text[]` (e.g. `boss_mode`, `skill_creator`, `whatsapp_qr`).

**EventLog** — tenant-visible log (Logs page): `userId?, level, type (e.g. reply.no_api_key, billing.paid, channel.error), message, meta JSON?, createdAt`.

**AuditLog** — admin actions: `actorId?, action, targetType?, targetId?, meta JSON?, ip?, createdAt`.

**BillingEvent** — legacy Razorpay webhook idempotency: `eventId unique, userId?, type, payload JSON`.

**ContactMessage** — landing page contact form. **IntegrationRequest** — "request a tool" form (`toolName, useCase, status`).

Queue tables live in schema `pgboss` (managed by pg-boss).

---

## 6. API reference

All tenant routes require the session cookie (or `Authorization: Bearer`) and CSRF header for writes.

**Auth** `/api/auth`: `POST signup`, `POST login`, `POST refresh`, `POST logout`, `GET me`, `POST password`, `POST forgot-password`, `POST reset-password`, `POST impersonation/exit` (legacy: `verify-email`, `resend-verification`).

**Tenant** `/api`
| Area | Routes |
|---|---|
| Dashboard | `GET dashboard` |
| Agent | `GET agent`, `PUT agent/personality`, `PUT agent/knowledge`, `PUT agent/boss-numbers`, `GET agent/prompt-preview`, `PUT keys`, `DELETE keys/:provider`, `POST keys/test` |
| Skills | `GET skills`, `POST skills`, `PUT skills/:id`, `DELETE skills/:id` |
| Channels | `GET channels`, `POST channels/telegram`, `POST channels/whatsapp-qr`, `POST channels/whatsapp-cloud`, `GET channels/:id/qr`, `PATCH channels/:id` (aiEnabled), `POST channels/:id/reconnect`, `DELETE channels/:id` |
| Templates | `GET channels/:id/templates`, `POST channels/:id/templates/sync`, `POST channels/:id/templates`, `PATCH channels/:id/templates/:tplId` |
| Inbox | `GET conversations`, `GET conversations/:id/messages`, `POST conversations/:id/reply`, `POST conversations/:id/template`, `POST conversations/start` |
| Other | `GET/PATCH appointments`, `GET leads`, `GET learning`, `DELETE learning/:id`, `GET logs`, `GET/POST/PATCH/DELETE schedules` |
| Google | `GET/DELETE integrations/google`, `PUT …/credentials`, `POST …/connect`, `GET …/callback`, `PUT …/settings`, `GET/POST/DELETE sheets`, `GET sheets/:id/preview` |
| Billing | `GET billing`, `POST billing/checkout`, `GET billing/orders/:orderId` |

**Public** `/api/public`: `GET plans`, `POST contact`.

**Admin** `/api/admin` (ADMIN only): `GET overview`, `GET users`, `GET/PATCH/DELETE users/:id` (plan, status, role, extend trial, approve, impersonate), `GET/POST/PUT/DELETE skills`, `GET plans`, `PUT plans/:id`, `DELETE plans/:id` (reset), `GET/PUT/DELETE flags/:key`, `GET audit`, `GET/PATCH integration-requests`, `GET contact-messages`.

**Webhooks** `/webhooks`: `POST telegram/:channelId`, `GET|POST whatsapp/:channelId`, `POST cashfree`, `POST razorpay` (legacy).

**Health**: `GET /health`, `GET /health/ready` (DB check), `GET /web-health` (via Caddy).

---

## 7. Web app pages

| Area | Pages |
|---|---|
| Public | `/` landing (live pricing from `/api/public/plans`), `/terms`, `/refund-policy`, `/privacy` |
| Auth | `/signup`, `/login`, `/forgot-password`, `/reset-password` |
| Tenant | `/dashboard`, `/conversations`, `/appointments`, `/schedules`, `/learning`, `/agent` (Skills, Skill Store, Google Sheets, API Keys, Personality), `/knowledge`, `/integrations` (Channels, Google), `/billing`, `/logs`, `/docs` |
| Admin | `/admin` overview, `/admin/users`, `/admin/users/:id`, `/admin/plans`, `/admin/contacts`, `/admin/requests`, `/admin/skills`, `/admin/flags`, `/admin/audit` |

Design: light green + white theme (dark mode available), grouped sidebar, page error boundaries with auto-reload after deploys.

---

## 8. Configuration (environment)

| Variable | Purpose |
|---|---|
| `APP_URL` | Public URL (→ `WEB_ORIGIN`, `PUBLIC_API_URL`); must be `https://…` |
| `POSTGRES_PASSWORD` (+ `POSTGRES_USER`, `POSTGRES_DB`) | Database |
| `JWT_SECRET` (≥32 chars), `ENCRYPTION_KEY` (64 hex) | Sessions, encryption at rest |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seed admin; admin notifications |
| `SMTP_HOST/PORT/SECURE/USER/PASS` (`SMTP_PASSWORD` alias), `MAIL_FROM` (`SMTP_FROM` alias) | Email |
| `BILLING_ENABLED`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`, `CASHFREE_API_VERSION` | Payments |
| `BAILEYS_ENABLED`, `WA_SESSIONS_DIR`, `WA_GRAPH_VERSION` | WhatsApp |
| `TRUST_PROXY` (default 2), `COOKIE_SECURE`, `AUTH_RATE_LIMIT_PER_MIN`, `LOG_LEVEL` | Server |
| `API_MAX_MEMORY_MB`, `WEB_MAX_MEMORY_MB` | Memory caps for a 1 vCPU / 2 GB VPS |

---

## 9. Build, test, deploy

```bash
npm ci
docker compose up -d db          # local Postgres on :5433 (also used by tests)
npm run dev:api & npm run dev:web
npm run typecheck && npm run lint && npm test
docker compose up -d --build     # full production image locally on http://localhost:3000
```

Deploy: push to `main` → GitHub Actions **CI** (lint, typecheck, tests) and **Docker image** (build → `ghcr.io/aiwithsalman33/cowork-ai:latest`) → Dokploy **Deploy** (`docker-compose.prod.yml`: db, app, caddy). Dokploy domain → service `caddy`, port 8080, HTTPS (Let's Encrypt). Migrations run automatically on start. After a deploy allow 2–3 minutes for the app health check.

External setup checklist: Telegram bot token; Meta app (webhook callback + verify token, subscribe `messages`, permanent token, payment method); Cashfree (API keys, webhook `…/webhooks/cashfree`, domain whitelisting, KYC for live); Google Cloud OAuth client (redirect `…/api/integrations/google/callback`).
