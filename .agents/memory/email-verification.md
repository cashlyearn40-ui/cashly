---
name: Email verification system
description: OTP-based email verification — how it works, routing logic, key decisions.
---

# Email Verification System

## Architecture
- **Email service**: Resend (`RESEND_API_KEY` secret). From address: `RESEND_FROM_EMAIL` env var or `onboarding@resend.dev` fallback.
- **DB columns on `app_users`**: `is_verified BOOLEAN DEFAULT FALSE`, `verification_code VARCHAR(6)`, `verification_expiry BIGINT`, `auth_method TEXT DEFAULT 'email'`.
- **Existing users were migrated to `is_verified = TRUE`** at schema migration time so they aren't blocked.

## Backend endpoints
- `POST /api/auth/signup` — auto-generates OTP, stores it, sends email, returns `{ isVerified: false, authMethod: 'email' }`.
- `POST /api/auth/login` — returns `isVerified` and `authMethod` in response.
- `POST /api/auth/google` — inserts with `authMethod: 'google'`, returns `{ isVerified: false/true, authMethod: 'google' }`.
- `POST /api/auth/send-verification` — generates new OTP (10 min TTL), sends email.
- `POST /api/auth/verify-code` — validates OTP, sets `is_verified=TRUE`, clears code/expiry.

## AuthContext
- New state: `isVerified`, `authMethod` (both persisted in AsyncStorage via `@cashly_verified` / `@cashly_auth_method`).
- New functions: `sendVerification()`, `verifyCode(code)`.
- `verifyCode()` updates both state and AsyncStorage synchronously on success.

## Routing (AuthGuard in _layout.tsx)
- **Email users not verified** → hard redirect to `/(auth)/verify`, blocked everywhere else.
- **Google users not verified** → allowed through (soft banner on home screen only).
- Verified/admin users follow existing routing logic.

## Key files
- `app/(auth)/verify.tsx` — full-screen OTP entry (6 boxes, auto-advance, paste, resend 60s countdown).
- `components/VerificationBanner.tsx` — blue banner + built-in OTP modal for Google users.
- `app/(auth)/_layout.tsx` — includes `verify` screen in the Stack.

**Why email=hard-block, google=soft-banner:** Google already authenticates the email address; email/password allows arbitrary email input so verification is required for security.
