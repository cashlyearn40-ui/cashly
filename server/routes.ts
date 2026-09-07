import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { db } from "./db";
import {
  appUsers,
  userProfiles,
  balances,
  earnings,
  withdrawals,
  notifications,
  dailyProgress,
  adminConfig,
} from "@shared/schema";
import { eq, and, desc, sql, ne } from "drizzle-orm";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;
const MAX_EARN_PER_CALL = 5.00;       // Hard cap per single earn event (USD)
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;  // 8 hours
const USER_SESSION_TTL  = 30 * 24 * 60 * 60 * 1000; // 30 days
const PIN_DEFAULT = "1717";
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes

// ─── Admin PIN lockout (in-memory, resets on server restart) ─────────────────
const adminPinLockout = { attempts: 0, lockedUntil: 0 };

// ─── Credentials from environment (never hardcoded) ──────────────────────────
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("[startup] FATAL: ADMIN_EMAIL or ADMIN_PASSWORD env var is missing.");
}

// Pre-compute admin password hash once at startup so login comparisons are fast.
let _adminPasswordHash = "";
bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS).then((h) => { _adminPasswordHash = h; });

// Helper: true if the string already looks like a bcrypt hash
function isBcryptHash(s: string): boolean {
  return s.startsWith("$2b$") || s.startsWith("$2a$") || s.startsWith("$2y$");
}

// ─── Admin session tokens ─────────────────────────────────────────────────────
// Issued on admin login; stored server-side so no secret needs to live in the frontend.
const adminSessions = new Map<string, number>(); // token → expiresAt (ms)

function issueAdminToken(): string {
  // Purge expired sessions first
  const now = Date.now();
  for (const [t, exp] of adminSessions) {
    if (now > exp) adminSessions.delete(t);
  }
  const token = randomBytes(32).toString("hex");
  adminSessions.set(token, now + ADMIN_SESSION_TTL);
  return token;
}

function validateAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const exp = adminSessions.get(token);
  if (!exp || Date.now() > exp) {
    if (exp) adminSessions.delete(token);
    return false;
  }
  return true;
}

// ─── SSE broadcast system ─────────────────────────────────────────────────────
const adminSseClients = new Set<Response>();

// Active user presence: email → { email, username, connectedAt }
type PresenceRecord = { email: string; username: string; connectedAt: number };
const activeUserPresence = new Map<string, PresenceRecord>();

function broadcastAdminUpdate() {
  const dead: Response[] = [];
  for (const client of adminSseClients) {
    try {
      client.write("data: refresh\n\n");
    } catch {
      dead.push(client);
    }
  }
  dead.forEach((c) => adminSseClients.delete(c));
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Accept token from header OR query param (EventSource can't send custom headers)
  const token = (req.headers["x-admin-token"] ?? req.query.token) as string | undefined;
  if (!validateAdminToken(token)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

// ─── User session tokens ──────────────────────────────────────────────────────
// Issued on login/signup; stored server-side so the client never acts on just an email.
const userSessions = new Map<string, { email: string; expiresAt: number }>();

function issueUserToken(email: string): string {
  const now = Date.now();
  // Purge expired sessions first
  for (const [t, s] of userSessions) {
    if (now > s.expiresAt) userSessions.delete(t);
  }
  const token = randomBytes(32).toString("hex");
  userSessions.set(token, { email, expiresAt: now + USER_SESSION_TTL });
  return token;
}

function validateUserToken(token: string | undefined): string | null {
  if (!token) return null;
  const session = userSessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    if (session) userSessions.delete(token);
    return null;
  }
  return session.email;
}

/** Middleware: validates x-user-token header, injects req.userEmail */
function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-user-token"] as string | undefined;
  const email = validateUserToken(token);
  if (!email) return res.status(401).json({ message: "No autorizado." });
  (req as any).userEmail = email;
  next();
}

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

async function pushNotification(
  email: string,
  type: string,
  title: string,
  body: string,
  amountUsd?: number
) {
  await db.insert(notifications).values({
    id: genId(),
    email,
    type,
    title,
    body,
    amountUsd: amountUsd ?? null,
    read: false,
    createdAt: Date.now(),
  });
}

// ─── Startup cleanup ─────────────────────────────────────────────────────────
async function deleteUserData(email: string) {
  await db.delete(dailyProgress).where(eq(dailyProgress.email, email));
  await db.delete(notifications).where(eq(notifications.email, email));
  await db.delete(withdrawals).where(eq(withdrawals.email, email));
  await db.delete(earnings).where(eq(earnings.email, email));
  await db.delete(balances).where(eq(balances.email, email));
  await db.delete(userProfiles).where(eq(userProfiles.email, email));
  await db.delete(appUsers).where(eq(appUsers.email, email));
}

async function cleanupResidualAccounts() {
  try {
    // Remove unconfirmed accounts: currency never set + zero balance + no earnings.
    // The admin account is preserved because it is not a regular user account.
    const unconfirmed = await db.select({ email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.currency, ""));

    for (const { email } of unconfirmed) {
      if (email === ADMIN_EMAIL) continue;
      const [bal, earn] = await Promise.all([
        db.select().from(balances).where(eq(balances.email, email)),
        db.select({ id: earnings.id }).from(earnings).where(eq(earnings.email, email)).limit(1),
      ]);
      const isUnused =
        earn.length === 0 &&
        (bal.length === 0 || (bal[0].balanceUsd === 0 && bal[0].lifetimeUsd === 0));
      if (isUnused) {
        await deleteUserData(email);
      }
    }

    console.log("[startup] Residual account cleanup complete.");
  } catch (e) {
    console.error("[startup cleanup error]", e);
  }
}

// Ensure the administrator has a database record with a bcrypt password hash.
// The environment value remains the source of truth; plaintext is never stored.
async function ensureAdminAccount() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  try {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
    _adminPasswordHash = passwordHash;
    const existing = await db.select({ email: appUsers.email })
      .from(appUsers)
      .where(eq(appUsers.email, ADMIN_EMAIL));

    if (existing.length === 0) {
      await db.insert(appUsers).values({
        email: ADMIN_EMAIL,
        password: passwordHash,
        createdAt: Date.now(),
        isVerified: true,
      });
    } else {
      await db.update(appUsers)
        .set({ password: passwordHash, isVerified: true })
        .where(eq(appUsers.email, ADMIN_EMAIL));
    }
    console.log("[startup] Admin account verified.");
  } catch (e) {
    console.error("[startup admin account error]", e);
  }
}

// ─── Password migration ───────────────────────────────────────────────────────
// Runs once at startup: any stored password that is NOT already a bcrypt hash
// gets hashed in-place.  Users never need to change or re-enter their password.
async function migratePasswords() {
  try {
    const users = await db.select({ email: appUsers.email, password: appUsers.password })
      .from(appUsers);

    let migrated = 0;
    for (const u of users) {
      if (isBcryptHash(u.password)) continue;          // already hashed
      const hashed = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
      await db.update(appUsers)
        .set({ password: hashed })
        .where(eq(appUsers.email, u.email));
      migrated++;
    }

    if (migrated > 0) {
      console.log(`[startup] Migrated ${migrated} plaintext password(s) to bcrypt hashes.`);
    } else {
      console.log("[startup] All passwords already hashed — no migration needed.");
    }
  } catch (e) {
    console.error("[startup password migration error]", e);
  }
}

// ─── Admin PIN initialization ─────────────────────────────────────────────────
// Runs at startup: if no pinHash is stored, hash the default PIN and insert it.
async function initAdminPin() {
  try {
    const existing = await db.select().from(adminConfig).where(eq(adminConfig.key, "pinHash"));
    if (existing.length === 0) {
      const hash = await bcrypt.hash(PIN_DEFAULT, BCRYPT_ROUNDS);
      await db.insert(adminConfig).values({ key: "pinHash", value: hash });
      console.log("[startup] Admin PIN initialized with default.");
    } else {
      console.log("[startup] Admin PIN already configured.");
    }
  } catch (e) {
    console.error("[startup PIN init error]", e);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Run startup tasks (all idempotent)
  // Complete migrations before exposing login, otherwise a request arriving
  // during startup can compare a legacy plaintext value against bcrypt.
  await cleanupResidualAccounts();
  await ensureAdminAccount();
  await migratePasswords();
  await initAdminPin();

  // ─── AUTH ────────────────────────────────────────────────────────────────

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const trimmed = email.trim().toLowerCase();

      if (trimmed === ADMIN_EMAIL) {
        return res.status(400).json({ message: "This email is not available." });
      }

      const existing = await db.select().from(appUsers).where(eq(appUsers.email, trimmed));
      if (existing.length > 0) {
        return res.status(400).json({ message: "An account with this email already exists." });
      }

      const now = Date.now();
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db.insert(appUsers).values({ email: trimmed, password: hashedPassword, createdAt: now });
      await db.insert(userProfiles).values({ email: trimmed });
      await db.insert(balances).values({ email: trimmed, balanceUsd: 0, lifetimeUsd: 0, updatedAt: now });

      await pushNotification(trimmed, "bonus", "¡Bienvenido a Cashly Earn!", "¡Bienvenido a la comunidad de Cashly Earn! Explora nuestras secciones y prepárate para ganar recompensas de forma segura.");
      await pushNotification(trimmed, "new_tasks", "Explora la app", "Ya puedes revisar tu historial, configurar tu cuenta y solicitar retiros cuando tengas saldo disponible.");

      const userToken = issueUserToken(trimmed);
      res.status(201).json({ email: trimmed, createdAt: now, userToken });
      broadcastAdminUpdate();
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // ─── DELETE ACCOUNT ──────────────────────────────────────────────────────
  app.delete("/api/user/account", requireUser, async (req, res) => {
    try {
      const trimmed = (req as any).userEmail as string;
      // Invalidate user session
      for (const [t, s] of userSessions) {
        if (s.email === trimmed) userSessions.delete(t);
      }
      if (!trimmed || trimmed === ADMIN_EMAIL) {
        return res.status(400).json({ message: "Cannot delete this account." });
      }
      await deleteUserData(trimmed);
      res.json({ ok: true });
      broadcastAdminUpdate();
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== "string" || typeof password !== "string" || !email.trim()) {
        return res.status(400).json({ message: "Email and password are required." });
      }

      // Email identity is canonicalized at the boundary. Password is
      // intentionally not trimmed: whitespace can be part of a password.
      const trimmed = email.trim().toLowerCase();

      // Admin login — compare against bcrypt-hashed admin password (computed at startup)
      if (trimmed === ADMIN_EMAIL) {
        const adminOk = _adminPasswordHash
          ? await bcrypt.compare(password, _adminPasswordHash)
          : false;
        if (!adminOk) return res.status(401).json({ message: "Invalid email or password." });
        const adminToken = issueAdminToken();
        return res.json({ email: ADMIN_EMAIL, createdAt: 0, isAdmin: true, adminToken });
      }

      // The database normally stores canonical emails, but this also accepts
      // legacy rows created before normalization was enforced.
      const rows = await db.select().from(appUsers)
        .where(sql`lower(trim(${appUsers.email})) = ${trimmed}`);
      if (rows.length === 0) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      const storedHash = rows[0].password;
      if (!isBcryptHash(storedHash)) {
        console.error("[auth/login] stored password is not a bcrypt hash");
        return res.status(500).json({ message: "Unable to verify credentials." });
      }

      const passwordOk = await bcrypt.compare(password, storedHash);
      if (!passwordOk) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      const canonicalEmail = rows[0].email.trim().toLowerCase();
      const userToken = issueUserToken(canonicalEmail);
      res.json({ email: canonicalEmail, createdAt: rows[0].createdAt, isAdmin: false, userToken });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // ─── USER BALANCE ─────────────────────────────────────────────────────────

  // User self-service — requires valid session token
  app.get("/api/user/balance", requireUser, async (req, res) => {
    try {
      const email = (req as any).userEmail as string;
      const rows = await db.select().from(balances).where(eq(balances.email, email));
      if (rows.length === 0) return res.json({ balance: 0, lifetime: 0 });
      const row = rows[0];
      res.json({
        balance: parseFloat(row.balanceUsd.toFixed(2)),
        lifetime: parseFloat(row.lifetimeUsd.toFixed(2)),
      });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // Admin access by email (admin panel "Users" tab)
  app.get("/api/user/balance/:email", requireAdmin, async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email).toLowerCase();
      const rows = await db.select().from(balances).where(eq(balances.email, email));
      if (rows.length === 0) return res.json({ balance: 0, lifetime: 0 });
      const row = rows[0];
      res.json({
        balance: parseFloat(row.balanceUsd.toFixed(2)),
        lifetime: parseFloat(row.lifetimeUsd.toFixed(2)),
      });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  app.post("/api/user/earn", requireUser, async (req, res) => {
    try {
      const trimmed = (req as any).userEmail as string;
      const { amount, description } = req.body as {
        amount: number;
        description?: string;
      };
      const numAmount = Number(amount);
      if (!trimmed || !isFinite(numAmount) || numAmount <= 0) {
        return res.status(400).json({ message: "Invalid request." });
      }
      if (numAmount > MAX_EARN_PER_CALL) {
        return res.status(400).json({ message: "Amount exceeds maximum allowed per event." });
      }
      const now = Date.now();

      const existing = await db.select().from(balances).where(eq(balances.email, trimmed));
      let newBalance: number;
      let newLifetime: number;

      if (existing.length === 0) {
        newBalance = parseFloat(numAmount.toFixed(4));
        newLifetime = parseFloat(numAmount.toFixed(4));
        await db.insert(balances).values({ email: trimmed, balanceUsd: newBalance, lifetimeUsd: newLifetime, updatedAt: now });
      } else {
        newBalance = parseFloat((existing[0].balanceUsd + numAmount).toFixed(4));
        newLifetime = parseFloat((existing[0].lifetimeUsd + numAmount).toFixed(4));
        await db.update(balances)
          .set({ balanceUsd: newBalance, lifetimeUsd: newLifetime, updatedAt: now })
          .where(eq(balances.email, trimmed));
      }

      await db.insert(earnings).values({
        id: genId(),
        email: trimmed,
        description: description ?? "Watched Video",
        amountUsd: numAmount,
        createdAt: now,
      });

      // Upsert daily_progress — accumulate earnings for today
      const today = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
      const existingDay = await db.select()
        .from(dailyProgress)
        .where(and(eq(dailyProgress.email, trimmed), eq(dailyProgress.date, today)));

      if (existingDay.length === 0) {
        await db.insert(dailyProgress).values({
          id: genId(),
          email: trimmed,
          date: today,
          amountUsd: numAmount.toFixed(4),
          updatedAt: now,
        });
      } else {
        const prevAmt = parseFloat(existingDay[0].amountUsd ?? "0");
        await db.update(dailyProgress)
          .set({ amountUsd: (prevAmt + numAmount).toFixed(4), updatedAt: now })
          .where(and(eq(dailyProgress.email, trimmed), eq(dailyProgress.date, today)));
      }

      res.json({ balance: newBalance, lifetime: newLifetime });
      broadcastAdminUpdate();
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // ─── USER HISTORY ─────────────────────────────────────────────────────────

  // User self-service — requires valid session token
  app.get("/api/user/history", requireUser, async (req, res) => {
    try {
      const email = (req as any).userEmail as string;
      const [earningRows, withdrawalRows] = await Promise.all([
        db.select().from(earnings).where(eq(earnings.email, email)).orderBy(desc(earnings.createdAt)),
        db.select().from(withdrawals).where(eq(withdrawals.email, email)).orderBy(desc(withdrawals.createdAt)),
      ]);

      res.json({
        earnings: earningRows.map((r) => ({
          id: r.id,
          type: "earning",
          description: r.description,
          amount: r.amountUsd,
          timestamp: r.createdAt,
        })),
        withdrawals: withdrawalRows.map((r) => ({
          id: r.id,
          type: "withdrawal",
          amount: r.amountUsd,
          method: r.method,
          detail: r.detail,
          status: r.status,
          timestamp: r.createdAt,
        })),
      });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // Admin access to user history by email (admin panel "Users" detail modal)
  app.get("/api/user/history/:email", requireAdmin, async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email).toLowerCase();
      const [earningRows, withdrawalRows] = await Promise.all([
        db.select().from(earnings).where(eq(earnings.email, email)).orderBy(desc(earnings.createdAt)),
        db.select().from(withdrawals).where(eq(withdrawals.email, email)).orderBy(desc(withdrawals.createdAt)),
      ]);
      res.json({
        earnings: earningRows.map((r) => ({ id: r.id, type: "earning", description: r.description, amount: r.amountUsd, timestamp: r.createdAt })),
        withdrawals: withdrawalRows.map((r) => ({ id: r.id, type: "withdrawal", amount: r.amountUsd, method: r.method, detail: r.detail, status: r.status, timestamp: r.createdAt })),
      });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // ─── WITHDRAWALS ─────────────────────────────────────────────────────────

  app.post("/api/user/withdraw", requireUser, async (req, res) => {
    try {
      const trimmed = (req as any).userEmail as string;
      const { amount, method, detail } = req.body as {
        amount: number;
        method: string;
        detail: string;
      };
      const numAmount = Number(amount);
      if (!trimmed || !isFinite(numAmount) || numAmount <= 0 || !method || !detail) {
        return res.status(400).json({ message: "Invalid request." });
      }
      const now = Date.now();

      const existing = await db.select().from(balances).where(eq(balances.email, trimmed));
      if (existing.length === 0 || existing[0].balanceUsd < numAmount) {
        return res.status(400).json({ message: "Insufficient balance." });
      }

      const newBalance = parseFloat((existing[0].balanceUsd - numAmount).toFixed(4));
      await db.update(balances)
        .set({ balanceUsd: newBalance, updatedAt: now })
        .where(eq(balances.email, trimmed));

      await db.insert(withdrawals).values({
        id: genId(),
        email: trimmed,
        amountUsd: numAmount,
        method,
        detail,
        status: "pending",
        createdAt: now,
        processedAt: null,
        expiresAt: now + TWENTY_FOUR_HOURS_MS,
      });

      res.json({ ok: true, balance: newBalance });
      broadcastAdminUpdate();
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────

  // User self-service — requires valid session token
  app.get("/api/user/notifications", requireUser, async (req, res) => {
    try {
      const email = (req as any).userEmail as string;
      const rows = await db.select()
        .from(notifications)
        .where(eq(notifications.email, email))
        .orderBy(desc(notifications.createdAt));

      res.json(rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        amount: r.amountUsd,
        read: r.read,
        timestamp: r.createdAt,
      })));
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // Admin access to user notifications by email
  app.get("/api/user/notifications/:email", requireAdmin, async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email).toLowerCase();
      const rows = await db.select().from(notifications).where(eq(notifications.email, email)).orderBy(desc(notifications.createdAt));
      res.json(rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, amount: r.amountUsd, read: r.read, timestamp: r.createdAt })));
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  app.post("/api/user/notifications/read", requireUser, async (req, res) => {
    try {
      const trimmed = (req as any).userEmail as string;
      await db.update(notifications)
        .set({ read: true })
        .where(eq(notifications.email, trimmed));
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // User self-service delete all notifications
  app.delete("/api/user/notifications", requireUser, async (req, res) => {
    try {
      const email = (req as any).userEmail as string;
      await db.delete(notifications).where(eq(notifications.email, email));
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // Admin delete user notifications by email
  app.delete("/api/user/notifications/:email", requireAdmin, async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email).toLowerCase();
      await db.delete(notifications).where(eq(notifications.email, email));
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  app.post("/api/user/notifications/add", requireAdmin, async (req, res) => {
    try {
      const { email, type, title, body, amount } = req.body as {
        email: string;
        type: string;
        title: string;
        body: string;
        amount?: number;
      };
      await pushNotification(email.trim().toLowerCase(), type, title, body, amount);
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // ─── USER SETTINGS ────────────────────────────────────────────────────────

  // Helper to build settings response from a DB profile row
  function buildSettingsResponse(p: typeof userProfiles.$inferSelect, email: string) {
    return {
      emoji: p.emoji,
      username: p.username || email.split("@")[0],
      language: p.language,
      currency: p.currency,
      dataSaver: p.dataSaver,
      payment: { method: p.paymentMethod, paypalEmail: p.paypalEmail, bankAccount: p.bankAccount },
      notifications: { newVideos: true, bonusAlerts: true, paymentUpdates: true },
    };
  }
  const DEFAULT_SETTINGS_RESPONSE = (email: string) => ({
    emoji: "😊", username: email.split("@")[0], language: "es", currency: "",
    dataSaver: false, payment: { method: "", paypalEmail: "", bankAccount: "" },
    notifications: { newVideos: true, bonusAlerts: true, paymentUpdates: true },
  });

  // User self-service — requires valid session token
  app.get("/api/user/settings", requireUser, async (req, res) => {
    try {
      const email = (req as any).userEmail as string;
      const rows = await db.select().from(userProfiles).where(eq(userProfiles.email, email));
      if (rows.length === 0) return res.json(DEFAULT_SETTINGS_RESPONSE(email));
      res.json(buildSettingsResponse(rows[0], email));
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // Admin access by email (admin panel "Users" detail modal)
  app.get("/api/user/settings/:email", requireAdmin, async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email).toLowerCase();
      const rows = await db.select().from(userProfiles).where(eq(userProfiles.email, email));
      if (rows.length === 0) return res.json(DEFAULT_SETTINGS_RESPONSE(email));
      res.json(buildSettingsResponse(rows[0], email));
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  app.put("/api/user/settings", requireUser, async (req, res) => {
    try {
      const trimmed = (req as any).userEmail as string;
      const patch = req.body as {
        emoji?: string;
        username?: string;
        language?: string;
        currency?: string;
        dataSaver?: boolean;
        payment?: { method?: string; paypalEmail?: string; bankAccount?: string };
      };

      const updateData: Record<string, any> = {};
      if (patch.emoji !== undefined) updateData.emoji = patch.emoji;
      if (patch.username !== undefined) updateData.username = patch.username;
      if (patch.language !== undefined) updateData.language = patch.language;
      if (patch.currency !== undefined) { updateData.currency = patch.currency; broadcastAdminUpdate(); }
      if (patch.dataSaver !== undefined) updateData.dataSaver = patch.dataSaver;
      if (patch.payment) {
        if (patch.payment.method !== undefined) updateData.paymentMethod = patch.payment.method;
        if (patch.payment.paypalEmail !== undefined) updateData.paypalEmail = patch.payment.paypalEmail;
        if (patch.payment.bankAccount !== undefined) updateData.bankAccount = patch.payment.bankAccount;
      }

      const existing = await db.select().from(userProfiles).where(eq(userProfiles.email, trimmed));
      if (existing.length === 0) {
        await db.insert(userProfiles).values({ email: trimmed, ...updateData });
      } else {
        await db.update(userProfiles).set(updateData).where(eq(userProfiles.email, trimmed));
      }

      res.json({ ok: true });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  app.put("/api/user/password", requireUser, async (req, res) => {
    try {
      const trimmed = (req as any).userEmail as string;
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };
      const rows = await db.select().from(appUsers).where(eq(appUsers.email, trimmed));
      if (rows.length === 0) return res.status(404).json({ message: "User not found." });

      const currentOk = await bcrypt.compare(currentPassword, rows[0].password);
      if (!currentOk) return res.status(400).json({ message: "Current password is incorrect." });

      const newHashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await db.update(appUsers).set({ password: newHashed }).where(eq(appUsers.email, trimmed));
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // ─── ADMIN ───────────────────────────────────────────────────────────────

  // ─── ADMIN WITHDRAWALS HISTORY ───────────────────────────────────────────
  app.get("/api/admin/withdrawals/all", requireAdmin, async (_req, res) => {
    try {
      const [allWithdrawals, allProfiles] = await Promise.all([
        db.select().from(withdrawals)
          .where(sql`${withdrawals.status} != 'pending'`)
          .orderBy(desc(withdrawals.createdAt)),
        db.select().from(userProfiles),
      ]);
      const profileMap = new Map(allProfiles.map((p) => [p.email, p]));
      res.json(
        allWithdrawals.map((w) => ({
          id: w.id,
          userEmail: w.email,
          username: profileMap.get(w.email)?.username || w.email.split("@")[0],
          amount: w.amountUsd,
          method: w.method,
          detail: w.detail,
          status: w.status,
          timestamp: w.createdAt,
          processedAt: w.processedAt ?? null,
        }))
      );
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  app.get("/api/admin/data", requireAdmin, async (_req, res) => {
    try {
      const [allUsers, allWithdrawals, allBalances, allProfiles] = await Promise.all([
        // Exclude admin account from all user lists and stats
        db.select().from(appUsers).where(ne(appUsers.email, ADMIN_EMAIL)).orderBy(desc(appUsers.createdAt)),
        db.select().from(withdrawals).orderBy(desc(withdrawals.createdAt)),
        db.select().from(balances).where(ne(balances.email, ADMIN_EMAIL)),
        db.select().from(userProfiles).where(ne(userProfiles.email, ADMIN_EMAIL)),
      ]);

      const balanceMap = new Map(allBalances.map((b) => [b.email, b]));
      const profileMap = new Map(allProfiles.map((p) => [p.email, p]));

      const userRows = allUsers.map((u) => {
        const bal = balanceMap.get(u.email);
        const prof = profileMap.get(u.email);
        return {
          email: u.email,
          createdAt: u.createdAt,
          password: "",
          balance: parseFloat((bal?.balanceUsd ?? 0).toFixed(2)),
          lifetime: parseFloat((bal?.lifetimeUsd ?? 0).toFixed(2)),
          username: prof?.username || u.email.split("@")[0],
        };
      });

      const pending = allWithdrawals
        .filter((w) => w.status === "pending")
        .map((w) => {
          const prof = profileMap.get(w.email);
          return {
            id: w.id,
            type: "withdrawal",
            amount: w.amountUsd,
            method: w.method,
            detail: w.detail,
            status: w.status,
            timestamp: w.createdAt,
            userEmail: w.email,
            username: prof?.username || w.email.split("@")[0],
          };
        });

      const totalPaidOut = allWithdrawals
        .filter((w) => w.status === "completed")
        .reduce((s, w) => s + w.amountUsd, 0);

      const totalLifetime = allBalances.reduce((s, b) => s + b.lifetimeUsd, 0);
      const totalPendingAmount = pending.reduce((s, w) => s + w.amount, 0);

      res.json({
        totalUsers: userRows.length,
        totalPaidOut: parseFloat(totalPaidOut.toFixed(2)),
        totalLifetime: parseFloat(totalLifetime.toFixed(2)),
        totalPendingAmount: parseFloat(totalPendingAmount.toFixed(2)),
        users: userRows,
        pending,
      });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  app.post("/api/admin/withdrawals/:id/approve", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const now = Date.now();

      // Always fetch withdrawal from DB — never trust client-supplied amount or email
      const wdRows = await db.select().from(withdrawals).where(eq(withdrawals.id, id));
      if (wdRows.length === 0) return res.status(404).json({ message: "Withdrawal not found." });
      const wd = wdRows[0];
      if (wd.status !== "pending") return res.status(400).json({ message: "Already processed." });

      await db.update(withdrawals)
        .set({ status: "completed", processedAt: now })
        .where(eq(withdrawals.id, id));

      await pushNotification(
        wd.email,
        "payment_approved",
        "¡Retiro aprobado!",
        `Tu retiro de $${wd.amountUsd.toFixed(2)} ha sido aprobado con éxito.`,
        wd.amountUsd
      );

      res.json({ ok: true });
      broadcastAdminUpdate();
    } catch (e: any) {
      console.error("[approve withdrawal]", e);
      res.status(500).json({ message: "Error al procesar el retiro." });
    }
  });

  app.post("/api/admin/withdrawals/:id/reject", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const now = Date.now();

      // Always fetch withdrawal from DB — never trust client-supplied amount or email
      const wdRows = await db.select().from(withdrawals).where(eq(withdrawals.id, id));
      if (wdRows.length === 0) return res.status(404).json({ message: "Withdrawal not found." });
      const wd = wdRows[0];
      if (wd.status !== "pending") return res.status(400).json({ message: "Already processed." });

      await db.update(withdrawals)
        .set({ status: "rejected", processedAt: now })
        .where(eq(withdrawals.id, id));

      // Refund using DB amount — not client-provided amount
      const existing = await db.select().from(balances).where(eq(balances.email, wd.email));
      if (existing.length > 0) {
        const newBalance = parseFloat((existing[0].balanceUsd + wd.amountUsd).toFixed(4));
        await db.update(balances)
          .set({ balanceUsd: newBalance, updatedAt: now })
          .where(eq(balances.email, wd.email));
      }

      await pushNotification(
        wd.email,
        "payment_rejected",
        "Retiro rechazado",
        `Tu retiro de $${wd.amountUsd.toFixed(2)} fue rechazado y el monto fue devuelto a tu saldo.`,
        wd.amountUsd
      );

      res.json({ ok: true });
      broadcastAdminUpdate();
    } catch (e: any) {
      console.error("[reject withdrawal]", e);
      res.status(500).json({ message: "Error al procesar el retiro." });
    }
  });

  // User logout — invalidates the session token immediately
  app.post("/api/user/logout", (req, res) => {
    const token = req.headers["x-user-token"] as string | undefined;
    if (token) userSessions.delete(token);
    res.json({ ok: true });
  });

  // Admin logout — invalidates the session token immediately
  app.post("/api/admin/logout", (req, res) => {
    const token = (req.headers["x-admin-token"] ?? (req.body as any)?.token) as string | undefined;
    if (token) adminSessions.delete(token);
    res.json({ ok: true });
  });

  // ─── Admin PIN ────────────────────────────────────────────────────────────

  // Verify admin PIN — returns ok or error; tracks lockout server-side
  app.post("/api/admin/pin/verify", requireAdmin, async (req, res) => {
    try {
      // Check lockout
      if (Date.now() < adminPinLockout.lockedUntil) {
        const remaining = Math.ceil((adminPinLockout.lockedUntil - Date.now()) / 60000);
        return res.status(429).json({
          message: `Demasiados intentos fallidos. Espera ${remaining} minuto(s).`,
          locked: true,
          remaining,
        });
      }

      const { pin } = req.body as { pin: string };
      if (!pin || !/^\d{4}$/.test(String(pin))) {
        return res.status(400).json({ message: "El PIN debe ser de 4 dígitos." });
      }

      const rows = await db.select().from(adminConfig).where(eq(adminConfig.key, "pinHash"));
      if (rows.length === 0) return res.status(500).json({ message: "PIN no configurado." });

      const ok = await bcrypt.compare(String(pin), rows[0].value);
      if (!ok) {
        adminPinLockout.attempts++;
        if (adminPinLockout.attempts >= PIN_MAX_ATTEMPTS) {
          adminPinLockout.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
          adminPinLockout.attempts = 0;
          return res.status(429).json({
            message: "Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos.",
            locked: true,
            remaining: 15,
          });
        }
        const left = PIN_MAX_ATTEMPTS - adminPinLockout.attempts;
        return res.status(401).json({
          message: `PIN incorrecto. ${left} intento(s) restante(s).`,
          attemptsLeft: left,
        });
      }

      // Success — reset lockout counter
      adminPinLockout.attempts = 0;
      adminPinLockout.lockedUntil = 0;
      res.json({ ok: true });
    } catch (e) {
      console.error("[pin/verify]", e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // Change admin PIN — requires current PIN + new PIN (4 digits)
  app.post("/api/admin/pin/change", requireAdmin, async (req, res) => {
    try {
      const { currentPin, newPin } = req.body as { currentPin: string; newPin: string };
      if (
        !currentPin || !newPin ||
        !/^\d{4}$/.test(String(currentPin)) ||
        !/^\d{4}$/.test(String(newPin))
      ) {
        return res.status(400).json({ message: "Los PINs deben ser de 4 dígitos numéricos." });
      }

      const rows = await db.select().from(adminConfig).where(eq(adminConfig.key, "pinHash"));
      if (rows.length === 0) return res.status(500).json({ message: "PIN no configurado." });

      const ok = await bcrypt.compare(String(currentPin), rows[0].value);
      if (!ok) return res.status(401).json({ message: "El PIN actual es incorrecto." });

      const newHash = await bcrypt.hash(String(newPin), BCRYPT_ROUNDS);
      await db.update(adminConfig).set({ value: newHash }).where(eq(adminConfig.key, "pinHash"));

      res.json({ ok: true });
    } catch (e) {
      console.error("[pin/change]", e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  app.post("/api/admin/broadcast", requireAdmin, async (req, res) => {
    try {
      const { title, body } = req.body as { title: string; body: string };
      const allUsers = await db.select({ email: appUsers.email }).from(appUsers);
      for (const u of allUsers) {
        await pushNotification(u.email, "broadcast", title, body);
      }
      res.json({ sent: allUsers.length });
    } catch (e: any) {
      console.error('[route]', e);
      res.status(500).json({ message: "Error del servidor. Intenta de nuevo." });
    }
  });

  // ─── User presence beacon ─────────────────────────────────────────────────
  app.get("/api/user/presence", async (req, res) => {
    // EventSource (SSE) cannot send custom headers — token arrives as a query param
    const tokenParam = (req.query.token as string) ?? "";
    const email = validateUserToken(tokenParam || undefined);
    if (!email || email === ADMIN_EMAIL) {
      return res.status(401).json({ message: "No autorizado." });
    }

    // Look up username from profile (non-blocking; fall back to email prefix)
    let username = email.split("@")[0];
    try {
      const prof = await db.select({ username: userProfiles.username })
        .from(userProfiles).where(eq(userProfiles.email, email)).limit(1);
      if (prof[0]?.username) username = prof[0].username;
    } catch {}

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    activeUserPresence.set(email, { email, username, connectedAt: Date.now() });
    broadcastAdminUpdate();

    res.write("data: connected\n\n");

    const hb = setInterval(() => {
      try { res.write(":hb\n\n"); } catch { clearInterval(hb); }
    }, 25000);

    req.on("close", () => {
      clearInterval(hb);
      activeUserPresence.delete(email);
      broadcastAdminUpdate();
    });
  });

  // ─── Admin: list of currently active users ────────────────────────────────
  app.get("/api/admin/active-users", requireAdmin, (_req, res) => {
    const users = Array.from(activeUserPresence.values()).map(({ email, username, connectedAt }) => ({
      email, username, connectedAt,
    }));
    res.json(users);
  });

  // ─── SSE real-time stream ─────────────────────────────────────────────────
  app.get("/api/admin/stream", requireAdmin, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    adminSseClients.add(res);
    res.write("data: connected\n\n");

    // Heartbeat every 25 s to keep the connection alive through proxies
    const hb = setInterval(() => {
      try { res.write(":hb\n\n"); } catch { clearInterval(hb); }
    }, 25000);

    req.on("close", () => {
      clearInterval(hb);
      adminSseClients.delete(res);
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
