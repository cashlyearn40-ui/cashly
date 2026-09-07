---
name: Security audit
description: Full security audit results and fixes applied to Cashly Earn.
---

## Fixes applied

| Finding | Severity | Fix |
|---|---|---|
| `CASHLY_ADMIN_KEY` hardcoded in JS bundle | CRITICAL | Replaced with server-issued session tokens; no secret in frontend |
| Reject endpoint trusted client-supplied amount for refund | HIGH | Now fetches withdrawal by ID from DB; ignores client body amount |
| Approve endpoint trusted client-supplied amount/email | HIGH | Now fetches withdrawal by ID from DB |
| `/api/user/notifications/add` was public | HIGH | Added `requireAdmin` middleware |
| No rate limiting on login/signup | HIGH | `express-rate-limit`: 20/15min on auth, 30/min on earn/withdraw |
| No security headers | MEDIUM | `helmet` added to server startup |
| Error messages leaked DB exceptions to clients | MEDIUM | All 500 catch blocks now log internally + return generic Spanish message |
| Request logger captured tokens/passwords in response bodies | MEDIUM | Auth/admin/password paths excluded from response body logging |
| Presence endpoint allowed arbitrary email spoofing | MEDIUM | Now verifies email exists in `app_users` before accepting connection |
| Earn endpoint had no per-call cap | MEDIUM | `MAX_EARN_PER_CALL = 5.00` hard cap enforced |
| Admin Google login didn't issue session token | MEDIUM | Fixed — both login paths now call `issueAdminToken()` |

## Architecture caveat (not fixable without full rewrite)

User endpoints (`/api/user/earn`, `/api/user/withdraw`, etc.) accept email from request body/params without session verification. There is no stateful session system — the app trusts whoever sends a given email. This is a known design limitation. Mitigations in place: earn cap, bcrypt on passwords, rate limiting.

## Remaining dependency vulnerabilities

Most HIGH vulns are in Expo toolchain (build-time only) or require drizzle-orm major version bump. `npm audit fix` applied non-breaking fixes. The remaining ones do not affect the server runtime directly.

## Packages added

- `helmet@8.x` — HTTP security headers
- `express-rate-limit@8.x` — rate limiting middleware
