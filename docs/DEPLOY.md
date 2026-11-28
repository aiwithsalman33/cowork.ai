# CoWork AI — Deploying

## How a change reaches production

```
pull request ─► CI: test + web-build + secrets-scan (+ smoke, non-blocking)
merge to main ─► CI again ─► image: ghcr.io/aiwithsalman33/cowork-ai:<sha> and :latest
              ─► deploy: calls the Dokploy deploy webhook, then waits until
                 https://coworkai.zenautomations.in/health shows release=<sha> and /health/ready is 200
```

Production changes **only** after tests and the web build pass. Every image is tagged with its git sha, so any earlier version can be redeployed.

## One-time setup (owner)

1. **Dokploy deploy webhook**: Dokploy → the CoWork app → **Deployments** → copy the **Deploy webhook URL**.
   GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**: name `DOKPLOY_DEPLOY_WEBHOOK`, value = that URL.
2. **Turn off automatic deploys in Dokploy** (git push / registry auto-pull), so only the CI `deploy` job deploys. Dokploy → app → **General** → disable **Autodeploy**.
3. **GitHub environment**: Settings → Environments → **New environment** `production`. Optionally add yourself as a required reviewer to approve each production deploy.
4. **Branch protection** for `main` (Settings → Branches → Add rule): require a pull request, and require the checks `test`, `web-build` and `secrets-scan` to pass.

## Roll back

The app runs `ghcr.io/aiwithsalman33/cowork-ai:${APP_IMAGE_TAG:-latest}`. To go back to a known-good version:

1. Find the last good commit sha in GitHub → **Actions** (a green run on `main`) or **Packages → cowork-ai** (tags).
2. Dokploy → app → **Environment** → add `APP_IMAGE_TAG=<good-sha>` → **Save** → **Deploy**.
3. Check `https://coworkai.zenautomations.in/health` shows `"release":"<good-sha>"` and sign in once.
4. After the fix is merged and deployed, remove `APP_IMAGE_TAG` (back to the newest build).

Database migrations only ever add columns and tables, so an older image runs fine against a newer database. If data itself is damaged, restore from backup: see `docs/RUNBOOK.md` → Backups & restore.

## After every deploy

- `https://coworkai.zenautomations.in/health/ready` → `{"ok":true,"db":"up"}`
- `https://coworkai.zenautomations.in/web-health` → 200
- Sign in, open Conversations, send one test message to the Telegram bot and check the reply.
