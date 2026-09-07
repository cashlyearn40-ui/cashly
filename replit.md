# Cashly - Replit.md

## Overview

Cashly is a mobile-first "earn money" app built with Expo (React Native). Users can earn virtual cash rewards by completing tasks like watching videos, completing surveys, and playing games. The app tracks a user's current balance and lifetime earnings, with a payout threshold mechanic ($25 minimum). It runs as a hybrid app: an Expo/React Native frontend and an Express.js backend API server, both running together in the Replit environment.

The app is currently in early development — the backend routes are mostly empty stubs, and the primary business logic (balance tracking, video watching) runs entirely on the frontend using AsyncStorage for persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK ~54 with Expo Router v6 for file-based navigation
- **Navigation Structure**: 
  - `app/(tabs)/` — main tab layout with Home screen
  - `app/watch-videos.tsx` — full-screen video watching experience
  - File-based routing using expo-router with typed routes enabled
- **UI Stack**:
  - Dark navy/green color theme defined in `constants/colors.ts`
  - Inter font family via `@expo-google-fonts/inter`
  - `expo-linear-gradient`, `expo-blur`, `expo-glass-effect` for visual effects
  - `react-native-reanimated` and `react-native-gesture-handler` for animations/gestures
  - `expo-haptics` for tactile feedback
  - Tab bar uses BlurView on iOS, solid background on Android/Web
- **State Management**:
  - `BalanceContext` (React Context + AsyncStorage) manages user balance and lifetime earnings locally on device
  - `@tanstack/react-query` is set up for server data fetching but minimally used currently
- **Data Persistence**: `@react-native-async-storage/async-storage` stores balance data locally on device
- **Platform Support**: iOS, Android, and Web (with platform-specific code branches)

### Backend (Express.js)

- **Framework**: Express v5 running via `tsx` in development, compiled with `esbuild` for production
- **Entry point**: `server/index.ts`
- **Routes**: `server/routes.ts` — currently a stub with no implemented API endpoints (all routes prefixed with `/api/`)
- **Storage**: `server/storage.ts` — currently uses in-memory storage (`MemStorage`) as a placeholder; designed around an `IStorage` interface to make swapping to a real database easy
- **CORS**: Configured to allow Replit dev/deployment domains and localhost origins

### Database

- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: `shared/schema.ts` defines a `users` table with `id`, `username`, and `password` fields
- **Migrations**: Drizzle Kit configured via `drizzle.config.ts`, outputs to `./migrations/`
- **Current State**: Database schema exists but the backend storage layer still uses in-memory storage — database integration is not yet wired up

### Shared Code

- `shared/schema.ts` is imported by both client and server, providing shared TypeScript types and Zod validation schemas

### API Communication

- `lib/query-client.ts` provides `apiRequest()` helper and TanStack Query client
- API base URL is determined by `EXPO_PUBLIC_DOMAIN` environment variable, pointing to the Express server
- The Expo dev server proxies through Replit's domain system using `REPLIT_DEV_DOMAIN`

### Build & Deployment

- **Dev**: Two processes run together — `expo start` (Metro bundler) and `tsx server/index.ts` (Express)
- **Prod**: Expo static build via `scripts/build.js`, Express compiled via `esbuild`
- The Express server serves the static Expo web build in production
- A landing page HTML template (`server/templates/landing-page.html`) is used for web visitors

## External Dependencies

| Dependency | Purpose |
|---|---|
| **PostgreSQL** (via `pg`) | Relational database for user data (provisioned via `DATABASE_URL` env var) |
| **Drizzle ORM** | Type-safe database access and schema management |
| **Expo / React Native** | Cross-platform mobile app framework |
| **TanStack React Query** | Server state management and API data fetching |
| **AsyncStorage** | Local device persistence for balance data |
| **expo-haptics** | Haptic feedback on supported devices |
| **expo-linear-gradient / expo-blur / expo-glass-effect** | Visual UI effects |
| **react-native-reanimated** | High-performance animations |
| **react-native-keyboard-controller** | Keyboard-aware scroll handling |
| **@expo-google-fonts/inter** | Inter font family |

### Environment Variables Required

- `DATABASE_URL` — PostgreSQL connection string (required for DB operations)
- `EXPO_PUBLIC_DOMAIN` — The domain where the Express API is hosted (used by the mobile client to make API calls)
- `REPLIT_DEV_DOMAIN` — Set automatically by Replit in development
- `REPLIT_DOMAINS` — Set automatically by Replit for production deployments