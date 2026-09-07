import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
  useCallback,
} from "react";
import {
  CurrencyCode,
  getStoredCurrency,
  setStoredCurrency,
  formatAmount,
  formatAmountShort,
  convertFromUSD,
} from "@/lib/currency";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/query-client";

interface CurrencyContextValue {
  currency: CurrencyCode;
  hasChosen: boolean;
  isLoaded: boolean;
  setCurrency: (code: CurrencyCode) => Promise<void>;
  format: (amountUSD: number) => string;
  formatShort: (amountUSD: number) => string;
  convert: (amountUSD: number) => number;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD");
  const [hasChosen, setHasChosen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      setCurrencyState("USD");
      setHasChosen(false);
      setIsLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoaded(false);
      // 1. Try AsyncStorage (fast, local)
      const stored = await getStoredCurrency(currentUser.email);
      if (cancelled) return;
      if (stored) {
        setCurrencyState(stored);
        setHasChosen(true);
        setIsLoaded(true);
        return;
      }
      // 2. Fallback: DB (covers reinstalls / new devices)
      try {
        const res = await apiRequest("GET", `/api/user/settings/${encodeURIComponent(currentUser.email)}`);
        if (!cancelled && res.ok) {
          const settings = await res.json();
          const dbCurrency = settings.currency as string;
          if (dbCurrency === "USD" || dbCurrency === "MXN") {
            await setStoredCurrency(currentUser.email, dbCurrency as CurrencyCode);
            if (!cancelled) {
              setCurrencyState(dbCurrency as CurrencyCode);
              setHasChosen(true);
              setIsLoaded(true);
              return;
            }
          }
        }
      } catch {}
      if (!cancelled) {
        setCurrencyState("USD");
        setHasChosen(false);
        setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.email]);

  const setCurrency = useCallback(
    async (code: CurrencyCode) => {
      if (!currentUser) return;
      // Persist to AsyncStorage and DB in parallel
      await Promise.all([
        setStoredCurrency(currentUser.email, code),
        apiRequest("PUT", "/api/user/settings", { email: currentUser.email, currency: code }).catch(() => {}),
      ]);
      setCurrencyState(code);
      setHasChosen(true);
    },
    [currentUser?.email]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      hasChosen,
      isLoaded,
      setCurrency,
      format: (amt: number) => formatAmount(amt, currency),
      formatShort: (amt: number) => formatAmountShort(amt, currency),
      convert: (amt: number) => convertFromUSD(amt, currency),
    }),
    [currency, hasChosen, isLoaded, setCurrency]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
