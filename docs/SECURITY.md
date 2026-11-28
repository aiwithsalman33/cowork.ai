# CoWork AI — Security notes

(The full security write-up is part of audit Phase 4. This file starts with the dependency policy.)

## Dependency audit

Run `npm audit --omit=dev` before each release. Production dependencies must have no known vulnerabilities, except the accepted advisories listed below with a reason and a review date.

### Accepted advisories

| Package (path)                                     | Advisory                                                         | Severity | Why it is accepted                                                                                                                                                                                                                                                 | Fix                                                   | Review by  |
| -------------------------------------------------- | ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------- |
| `deepmerge-ts` 7.1.5 (`prisma` → `@prisma/config`) | GHSA-ggr8-5vv4-36mx (stack exhaustion merging recursive objects) | high     | Used only by the **Prisma CLI** to read its own config file. The CLI runs once at container start (`prisma migrate deploy`) with our own files as input. No request or tenant data ever reaches it, and the app's query engine (`@prisma/client`) does not use it. | Prisma 7 (breaking upgrade); 6.19.3 is the newest 6.x | 2027-02-28 |
| `effect` 3.21.0 (`prisma` → `@prisma/config`)      | GHSA-7589-6fvf-x4pw (ReDoS in Schema.TemplateLiteral)            | high     | Same as above: Prisma CLI config loading only, never reachable from requests.                                                                                                                                                                                      | Prisma 7                                              | 2027-02-28 |

Checked 2026-11-28: after upgrading Sentry to v11, these are the only remaining findings (4 entries reported by npm for the 2 packages and their Prisma parents).
