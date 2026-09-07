---
name: Auth flow
description: Current authentication design — what exists and what was deliberately removed.
---

# Auth Flow

## What exists
- **Login screen** (`app/(auth)/login.tsx`) — email/password only.
- **AuthGuard** (`app/_layout.tsx`) — redirects unauthenticated users to `/(auth)/login`; authenticated users go to `/(tabs)` (or `/(admin)` for admin).
- **AuthContext** (`context/AuthContext.tsx`) — `login`, `loginWithGoogle`, `logout`, `changePassword`. No verification state.

## What was deliberately removed
- Email OTP verification system — fully removed (screen, banner, backend endpoints, i18n keys, AsyncStorage keys).
- `RESEND_API_KEY` secret exists in the environment but is unused.

## Current registration flow
- Signup/registration remains available at `app/(auth)/signup.tsx` with email/password only.

**Why:** User requested a direct, friction-free entry with no registration or verification codes.
