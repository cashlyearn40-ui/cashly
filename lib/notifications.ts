import { apiRequest } from "@/lib/query-client";

export type NotificationType =
  | "payment_approved"
  | "payment_rejected"
  | "bonus"
  | "new_tasks"
  | "broadcast"
  | "info";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  amount?: number;
  read: boolean;
  timestamp: number;
};

/** Fetch current user's notifications. Identity comes from the session token. */
export async function getNotifications(): Promise<AppNotification[]> {
  try {
    const res = await apiRequest("GET", "/api/user/notifications");
    return await res.json();
  } catch {
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  const list = await getNotifications();
  return list.filter((n) => !n.read).length;
}

/** Admin-only: push a notification to a specific user by email. */
export async function addNotification(
  email: string,
  notif: Omit<AppNotification, "id" | "timestamp" | "read"> & { read?: boolean }
): Promise<void> {
  try {
    await apiRequest("POST", "/api/user/notifications/add", {
      email,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      amount: notif.amount,
    });
  } catch {}
}

/** Mark all of the current user's notifications as read. */
export async function markAllAsRead(): Promise<void> {
  try {
    await apiRequest("POST", "/api/user/notifications/read");
  } catch {}
}

/** Delete all of the current user's notifications. */
export async function clearAllNotifications(): Promise<void> {
  try {
    await apiRequest("DELETE", "/api/user/notifications");
  } catch {}
}

export async function broadcastToAllUsers(
  title: string,
  body: string
): Promise<number> {
  try {
    const res = await apiRequest("POST", "/api/admin/broadcast", { title, body });
    const data = await res.json();
    return data.sent ?? 0;
  } catch {
    return 0;
  }
}

export async function notifyPaymentApproved(email: string, amount: number): Promise<void> {
  await addNotification(email, {
    type: "payment_approved",
    title: "¡Retiro aprobado!",
    body: `Tu retiro de $${amount.toFixed(2)} ha sido aprobado con éxito.`,
    amount,
  });
}

export async function notifyPaymentRejected(email: string, amount: number): Promise<void> {
  await addNotification(email, {
    type: "payment_rejected",
    title: "Retiro rechazado",
    body: `Tu retiro de $${amount.toFixed(2)} fue rechazado y el monto fue devuelto a tu saldo.`,
    amount,
  });
}

export async function notifyWelcomeBonus(_email: string): Promise<void> {
  // Welcome notifications are handled server-side on signup
}
