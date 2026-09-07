import { apiRequest } from "@/lib/query-client";

export type EarningRecord = {
  id: string;
  type: "earning";
  description: string;
  amount: number;
  timestamp: number;
};

export type WithdrawalRecord = {
  id: string;
  type: "withdrawal";
  amount: number;
  method: string;
  detail: string;
  status: "pending" | "completed" | "rejected";
  timestamp: number;
};

/** Fetch earnings for the current authenticated user. Identity comes from session token. */
export async function getEarnings(): Promise<EarningRecord[]> {
  try {
    const res = await apiRequest("GET", "/api/user/history");
    const data = await res.json();
    return data.earnings ?? [];
  } catch {
    return [];
  }
}

/** Fetch withdrawals for the current authenticated user. Identity comes from session token. */
export async function getWithdrawals(): Promise<WithdrawalRecord[]> {
  try {
    const res = await apiRequest("GET", "/api/user/history");
    const data = await res.json();
    return data.withdrawals ?? [];
  } catch {
    return [];
  }
}
