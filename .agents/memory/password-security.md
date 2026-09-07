---
name: Password security & admin auth
description: How passwords are hashed, admin sessions work, and credentials are managed in Cashly Earn.
---

## Password rules

- All passwords stored with `bcrypt.hash(password, 10)` — never plaintext.
- Login uses `bcrypt.compare(submitted, stored)` for both admin and regular users.
- Password change: verify current with `bcrypt.compare`, then hash new password before storing.
- Google OAuth users receive a hashed sentinel (`g_oauth_<sub>`) — they never log in with a password.
- Admin password is hashed once at server startup into `_adminPasswordHash` (in-memory); login compares against that.

**Why:** Pre-existing debt — passwords were stored in plaintext. Fixed with bcrypt in server/routes.ts.

**How to apply:** `isBcryptHash(s)` detects already-hashed values (`$2b$`, `$2a$`, `$2y$` prefixes). Used by the startup migration.

## Admin session token system (replaces hardcoded key)

The old `CASHLY_ADMIN_KEY` constant has been **removed from the frontend entirely** — no secret is hardcoded in the JS bundle.

Flow:
1. Admin logs in via `/api/auth/login` or `/api/auth/google` → server calls `issueAdminToken()` → returns `adminToken` in response.
2. `AuthContext` stores `adminToken` in state + `AsyncStorage` (`@cashly_admin_token`).
3. Admin panel syncs it into module-level `_adminToken`; all `adminFetch`/`adminRequest` calls use `x-admin-token` header.
4. SSE stream uses `?token=` query param (EventSource can't send custom headers).
5. Logout calls `POST /api/admin/logout` to invalidate the token server-side.

Server-side: `adminSessions: Map<string, number>` (token → expiresAt). TTL = 8 hours. Stale sessions are purged on each `issueAdminToken()` call.

**Why:** `CASHLY_ADMIN_KEY = "csh_adm_2x9f4e7c"` was literally hardcoded in `app/(admin)/index.tsx` line 29 — anyone inspecting the JS bundle could extract it and call all admin endpoints.

**How to apply:** `requireAdmin` middleware reads `x-admin-token` header or `token` query param, calls `validateAdminToken()`.

## Startup migration (`migratePasswords`)

Runs every boot (idempotent). Scans `app_users`, finds rows where `password` is not a bcrypt hash, hashes them in-place. Users never need to re-enter their password.

Log output: `[startup] Migrated N plaintext password(s) to bcrypt hashes.`

## Credentials location

| Credential | Storage |
|---|---|
| `ADMIN_EMAIL` | Replit env var (shared) |
| `ADMIN_PASSWORD` | Replit secret |
| `CASHLY_ADMIN_KEY` | ~~Replit secret~~ — no longer used anywhere |

`CASHLY_ADMIN_KEY` is no longer referenced in any code — admin access is now token-based.
