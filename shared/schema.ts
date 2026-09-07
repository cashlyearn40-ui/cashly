import {
  pgTable,
  text,
  doublePrecision,
  boolean,
  bigint,
  numeric,
  varchar,
} from "drizzle-orm/pg-core";

// ─── AUTH & PROFILE ──────────────────────────────────────────────────────────

export const appUsers = pgTable("app_users", {
  email: text("email").primaryKey(),
  password: text("password").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  verificationCode: varchar("verification_code", { length: 6 }),
  verificationExpiry: bigint("verification_expiry", { mode: "number" }),
});

export const userProfiles = pgTable("user_profiles", {
  email: text("email").primaryKey().references(() => appUsers.email),
  username: text("username").notNull().default(""),
  emoji: text("emoji").notNull().default("😊"),
  language: text("language").notNull().default("es"),
  currency: text("currency").notNull().default(""),
  dataSaver: boolean("data_saver").notNull().default(false),
  paypalEmail: text("paypal_email").notNull().default(""),
  paymentMethod: text("payment_method").notNull().default(""),
  bankAccount: text("bank_account").notNull().default(""),
});

// ─── BALANCES & EARNINGS ─────────────────────────────────────────────────────

export const balances = pgTable("balances", {
  email: text("email").primaryKey().references(() => appUsers.email),
  balanceUsd: doublePrecision("balance_usd").notNull().default(0),
  lifetimeUsd: doublePrecision("lifetime_usd").notNull().default(0),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const earnings = pgTable("earnings", {
  id: text("id").primaryKey(),
  email: text("email").notNull().references(() => appUsers.email),
  description: text("description").notNull().default("Watched Video"),
  amountUsd: doublePrecision("amount_usd").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  email: text("email").notNull().references(() => appUsers.email),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  amountUsd: doublePrecision("amount_usd"),
  read: boolean("read").notNull().default(false),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// ─── WITHDRAWALS ─────────────────────────────────────────────────────────────
//
// method:     "CLABE" | "CARD" | "bank" | "paypal"
// detail:     JSON string → { accountType, accountNumber, bank }
// status:     "pending" | "completed" | "rejected" | "expired"
// expiresAt:  Unix ms timestamp — set to createdAt + 24h at creation time.
//             A withdrawal not approved/rejected before this time is expired.

export const withdrawals = pgTable("withdrawals", {
  id: text("id").primaryKey(),
  email: text("email").notNull().references(() => appUsers.email),
  amountUsd: doublePrecision("amount_usd").notNull(),
  method: text("method").notNull(),
  detail: text("detail").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  processedAt: bigint("processed_at", { mode: "number" }),
  expiresAt: bigint("expires_at", { mode: "number" }),
});

// ─── ADMIN CONFIG ────────────────────────────────────────────────────────────
// Key-value store for server-side admin settings (e.g. PIN hash).
// pinHash key is set at startup from the default PIN if not already present.

export const adminConfig = pgTable("admin_config", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── DAILY PROGRESS ──────────────────────────────────────────────────────────
//
// Tracks how much a user earned each calendar day (YYYY-MM-DD).
// Used for daily goals, streaks, and analytics.
// One row per (email, date) — upserted on each earning event.
// amountUsd: cumulative USD earned on that date.

export const dailyProgress = pgTable("daily_progress", {
  id: text("id").primaryKey(),                                    // genId()
  email: text("email").notNull().references(() => appUsers.email),
  date: varchar("date", { length: 10 }).notNull(),               // YYYY-MM-DD
  amountUsd: numeric("amount_usd", { precision: 10, scale: 4 }).notNull().default("0.0000"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
