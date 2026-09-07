---
name: Admin panel
description: Structure, real-time sync, and PIN security of the Cashly Earn admin panel.
---

## Tab structure (app/(admin)/index.tsx)

Order: **Resumen → Retiros → Usuarios → Activos**

- **Resumen** — stats cards + financial summary + broadcast notification + "Cambiar PIN" button.
- **Retiros** — sub-tabbed: Pendientes (approve/reject) + Historial.
- **Usuarios** — all confirmed accounts (currency != "" in DB); never disappears on browser close; disappears on logout or account deletion.
- **Activos** — users with an open SSE presence connection RIGHT NOW; disappears the instant the tab/window/app closes.

## Admin PIN verification (2-factor flow)

After admin login (email + password OR Google OAuth), the admin MUST enter a 4-digit PIN before accessing the panel.

Flow:
1. Login succeeds → `isAdmin: true` + `adminToken` returned.
2. AuthContext sets `isAdminPinVerified = false` (always, never persisted).
3. AuthGuard redirects to `/(admin)/pin-verify` (not `/(admin)` directly).
4. User enters 4-digit PIN → `POST /api/admin/pin/verify` (requires `x-admin-token`).
5. On success → `isAdminPinVerified = true` → AuthGuard navigates to `/(admin)`.

Lockout: 5 failed attempts → locked 15 minutes (tracked in `adminPinLockout` module-level object in routes.ts, resets on server restart).

Default PIN: `1717` (set at startup if no `pinHash` row exists in `admin_config` table).

PIN storage: bcrypt-hashed in `admin_config` table, key = `"pinHash"`.

## Changing the PIN (admin panel → Resumen tab → SEGURIDAD)

Flow in `ChangePinModal`:
- Enter current PIN + confirm current PIN
- Enter new PIN + confirm new PIN
- All fields must be exactly 4 digits
- Current PIN verified server-side via `POST /api/admin/pin/change`
- New PIN and current PIN must differ

## Real-time sync

- Admin SSE: `GET /api/admin/stream?token=<adminToken>` — server pushes `data: refresh` after every mutation.
- User presence SSE: `GET /api/user/presence?email=<email>` — opened by `AuthContext` useEffect on web when a non-admin user is logged in; removed from `activeUserPresence` Map on connection close.
- `broadcastAdminUpdate()` is called after: signup (email + Google), deleteAccount, earn, withdraw, approve, reject, currency change.
- Client invalidates all three query keys on SSE message: `/api/admin/data`, `/api/admin/withdrawals/all`, `/api/admin/active-users`.

## Admin account rule

`cashlyearn40@gmail.com` is blocked from all user tables at every entry point (signup, Google OAuth, presence). Filtered with `ne(appUsers.email, ADMIN_EMAIL)` in SQL queries.

## CORS

`x-admin-token` must be in `Access-Control-Allow-Headers` (in `server/index.ts`). If the old `x-admin-key` is ever re-added, both headers need to be present.
