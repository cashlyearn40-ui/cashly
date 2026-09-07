import AsyncStorage from "@react-native-async-storage/async-storage";

export type CurrencyCode = "USD" | "MXN";

export const USD_TO_MXN = 17.5;

export const CURRENCY_META: Record<
  CurrencyCode,
  { code: CurrencyCode; symbol: string; flag: string; name: string; nameEs: string; locale: string }
> = {
  USD: {
    code: "USD",
    symbol: "$",
    flag: "🇺🇸",
    name: "US Dollar",
    nameEs: "Dólar estadounidense",
    locale: "en-US",
  },
  MXN: {
    code: "MXN",
    symbol: "$",
    flag: "🇲🇽",
    name: "Mexican Peso",
    nameEs: "Peso mexicano",
    locale: "es-MX",
  },
};

function currencyKey(email: string) {
  return `@cashly_currency_${email}`;
}

export async function getStoredCurrency(email: string): Promise<CurrencyCode | null> {
  try {
    const raw = await AsyncStorage.getItem(currencyKey(email));
    if (raw === "USD" || raw === "MXN") return raw;
    return null;
  } catch {
    return null;
  }
}

export async function setStoredCurrency(email: string, code: CurrencyCode): Promise<void> {
  try {
    await AsyncStorage.setItem(currencyKey(email), code);
  } catch {}
}

export function convertFromUSD(amountUSD: number, code: CurrencyCode): number {
  if (code === "USD") return amountUSD;
  return amountUSD * USD_TO_MXN;
}

export function formatAmount(amountUSD: number, code: CurrencyCode): string {
  const value = convertFromUSD(amountUSD, code);
  const meta = CURRENCY_META[code];
  const formatted = value.toLocaleString(meta.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${meta.symbol}${formatted} ${code}`;
}

export function formatAmountShort(amountUSD: number, code: CurrencyCode): string {
  const value = convertFromUSD(amountUSD, code);
  const meta = CURRENCY_META[code];
  const formatted = value.toLocaleString(meta.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${meta.symbol}${formatted}`;
}
