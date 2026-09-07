import { apiRequest } from "@/lib/query-client";

export type UserSettings = {
  emoji: string;
  username: string;
  notifications: {
    newVideos: boolean;
    bonusAlerts: boolean;
    paymentUpdates: boolean;
  };
  dataSaver: boolean;
  payment: {
    method: "paypal" | "bank" | "";
    paypalEmail: string;
    bankAccount: string;
  };
  language: "es" | "en";
};

export const DEFAULT_SETTINGS: UserSettings = {
  emoji: "😊",
  username: "",
  notifications: { newVideos: true, bonusAlerts: true, paymentUpdates: true },
  dataSaver: false,
  payment: { method: "", paypalEmail: "", bankAccount: "" },
  language: "es",
};

/** Fetch settings for the current authenticated user. Identity comes from session token. */
export async function getUserSettings(): Promise<UserSettings> {
  try {
    const res = await apiRequest("GET", "/api/user/settings");
    const data = await res.json();
    return {
      emoji: data.emoji ?? DEFAULT_SETTINGS.emoji,
      username: data.username ?? "",
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(data.notifications ?? {}) },
      dataSaver: data.dataSaver ?? false,
      payment: { ...DEFAULT_SETTINGS.payment, ...(data.payment ?? {}) },
      language: data.language ?? "es",
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications },
      payment: { ...DEFAULT_SETTINGS.payment },
    };
  }
}

/** Save a partial settings update for the current authenticated user. */
export async function saveUserSettings(patch: Partial<UserSettings>): Promise<void> {
  try {
    await apiRequest("PUT", "/api/user/settings", patch);
  } catch {}
}
