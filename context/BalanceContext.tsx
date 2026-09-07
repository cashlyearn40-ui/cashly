import React, {
  createContext,
  useContext,
  useMemo,
  ReactNode,
  useCallback,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

interface BalanceContextValue {
  balance: number;
  lifetime: number;
  addEarning: (amount: number, description?: string) => Promise<void>;
  isLoaded: boolean;
}

const BalanceContext = createContext<BalanceContextValue | null>(null);

export function BalanceProvider({ children }: { children: ReactNode }) {
  const { currentUser, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const email = currentUser?.email ?? "";
  const enabled = !!email && !isAdmin;

  const { data, isSuccess, isLoading } = useQuery<{ balance: number; lifetime: number }>({
    queryKey: ["/api/user/balance"],
    enabled,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const addEarning = useCallback(
    async (amount: number, description = "Watched Video") => {
      if (!currentUser || isAdmin) return;

      // Optimistic update — server identity verified via x-user-token header
      queryClient.setQueryData<{ balance: number; lifetime: number }>(
        ["/api/user/balance"],
        (old) => ({
          balance: parseFloat(((old?.balance ?? 0) + amount).toFixed(2)),
          lifetime: parseFloat(((old?.lifetime ?? 0) + amount).toFixed(2)),
        })
      );

      try {
        const res = await apiRequest("POST", "/api/user/earn", { amount, description });
        const fresh = await res.json();
        queryClient.setQueryData(["/api/user/balance"], {
          balance: fresh.balance,
          lifetime: fresh.lifetime,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/user/history"] });
      } catch {
        queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      }
    },
    [currentUser, isAdmin, email, queryClient]
  );

  const value = useMemo(
    () => ({
      balance: data?.balance ?? 0,
      lifetime: data?.lifetime ?? 0,
      addEarning,
      isLoaded: !enabled || isSuccess,
    }),
    [data, addEarning, enabled, isSuccess]
  );

  return (
    <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>
  );
}

export function useBalance() {
  const ctx = useContext(BalanceContext);
  if (!ctx) throw new Error("useBalance must be used within BalanceProvider");
  return ctx;
}
