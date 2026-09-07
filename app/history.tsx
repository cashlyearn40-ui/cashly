import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useLanguage } from "@/context/LanguageContext";
import i18n from "@/lib/i18n";
import {
  getEarnings,
  getWithdrawals,
  EarningRecord,
  WithdrawalRecord,
} from "@/lib/history";
import Colors from "@/constants/colors";

type Tab = "earnings" | "withdrawals";

function formatDate(timestamp: number, todayLabel: string, yesterdayLabel: string): string {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const isYesterday =
    d.getDate() === now.getDate() - 1 &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `${todayLabel} · ${time}`;
  if (isYesterday) return `${yesterdayLabel} · ${time}`;
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` · ${time}`
  );
}

function EarningRow({ item, todayLabel, yesterdayLabel }: { item: EarningRecord; todayLabel: string; yesterdayLabel: string }) {
  const { formatShort } = useCurrency();
  return (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        <LinearGradient
          colors={[Colors.green.dark, Colors.green.primary]}
          style={styles.rowIconGradient}
        >
          <Ionicons name="play" size={14} color="#fff" />
        </LinearGradient>
      </View>
      <View style={styles.rowMid}>
        <Text style={styles.rowTitle}>{item.description}</Text>
        <Text style={styles.rowDate}>{formatDate(item.timestamp, todayLabel, yesterdayLabel)}</Text>
      </View>
      <Text style={styles.earningAmount}>+{formatShort(item.amount)}</Text>
    </View>
  );
}

function parseWithdrawalDetail(detail: string): {
  accountNumber: string;
  accountType: string;
  bank: string;
} {
  try {
    const parsed = JSON.parse(detail);
    return {
      accountNumber: parsed.accountNumber ?? detail,
      accountType: parsed.accountType ?? "",
      bank: parsed.bank ?? "",
    };
  } catch {
    return { accountNumber: detail, accountType: "", bank: "" };
  }
}

function WithdrawalRow({
  item,
  todayLabel,
  yesterdayLabel,
  bankTransferLabel,
  cardMethodLabel,
  statusPending,
  statusCompleted,
  statusRejected,
}: {
  item: WithdrawalRecord;
  todayLabel: string;
  yesterdayLabel: string;
  bankTransferLabel: string;
  cardMethodLabel: string;
  statusPending: string;
  statusCompleted: string;
  statusRejected: string;
}) {
  const { formatShort } = useCurrency();
  const STATUS_CONFIG = {
    pending: {
      label: statusPending,
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.12)",
      border: "rgba(245,158,11,0.25)",
      icon: "time-outline" as const,
    },
    completed: {
      label: statusCompleted,
      color: Colors.green.primary,
      bg: "rgba(46,204,90,0.1)",
      border: "rgba(46,204,90,0.25)",
      icon: "checkmark-circle-outline" as const,
    },
    rejected: {
      label: statusRejected,
      color: "#f87171",
      bg: "rgba(248,113,113,0.1)",
      border: "rgba(248,113,113,0.25)",
      icon: "close-circle-outline" as const,
    },
  };
  const cfg =
    STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ??
    STATUS_CONFIG.pending;

  // Derive method label + masked account from parsed detail
  const { accountNumber, accountType, bank } = parseWithdrawalDetail(item.detail);
  const effectiveMethod = item.method || accountType;
  let methodLabel: string;
  if (effectiveMethod === "paypal" || effectiveMethod === "PayPal") {
    methodLabel = "PayPal";
  } else if (effectiveMethod === "CARD" || effectiveMethod === "card") {
    methodLabel = cardMethodLabel;
  } else {
    methodLabel = bankTransferLabel; // CLABE, bank, or unknown
  }

  const maskedAccount =
    accountNumber.length > 4
      ? `${"•".repeat(Math.min(accountNumber.length - 4, 12))}${accountNumber.slice(-4)}`
      : accountNumber;

  const subtitle = bank
    ? `${maskedAccount} · ${bank}`
    : maskedAccount;

  return (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        <View style={styles.withdrawalIconWrap}>
          <Ionicons
            name="wallet-outline"
            size={16}
            color="rgba(255,255,255,0.5)"
          />
        </View>
      </View>
      <View style={styles.rowMid}>
        <Text style={styles.rowTitle}>{methodLabel}</Text>
        <Text style={styles.rowDate} numberOfLines={1}>
          {subtitle} · {formatDate(item.timestamp, todayLabel, yesterdayLabel)}
        </Text>
      </View>
      <View style={styles.withdrawalRight}>
        <Text style={styles.withdrawalAmount}>-{formatShort(item.amount)}</Text>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: cfg.bg, borderColor: cfg.border },
          ]}
        >
          <Ionicons name={cfg.icon} size={10} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>
            {cfg.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

function EmptyState({ tab, t }: { tab: Tab; t: typeof i18n["es"]["history"] }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons
          name={tab === "earnings" ? "play-circle-outline" : "wallet-outline"}
          size={40}
          color="rgba(255,255,255,0.15)"
        />
      </View>
      <Text style={styles.emptyTitle}>
        {tab === "earnings" ? t.noEarningsTitle : t.noWithdrawalsTitle}
      </Text>
      <Text style={styles.emptySubtitle}>
        {tab === "earnings" ? t.noEarningsSub : t.noWithdrawalsSub}
      </Text>
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { lang } = useLanguage();
  const t = i18n[lang].history;

  const [activeTab, setActiveTab] = useState<Tab>("earnings");
  const [earnings, setEarnings] = useState<EarningRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useFocusEffect(
    useCallback(() => {
      async function load() {
        if (!currentUser) return;
        setLoading(true);
        const [e, w] = await Promise.all([
          getEarnings(),
          getWithdrawals(),
        ]);
        setEarnings(e);
        setWithdrawals(w);
        setLoading(false);
      }
      load();
    }, [currentUser?.email])
  );

  const totalEarned = earnings.reduce((s, r) => s + r.amount, 0);
  const totalWithdrawn = withdrawals
    .filter((w) => w.status !== "rejected")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#060f1e", "#0a1628", "#0d2010"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{t.totalEarned}</Text>
          <Text style={styles.summaryValue}>
            <Text style={styles.summaryCurrency}>$</Text>
            {totalEarned.toFixed(2)}
          </Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{t.withdrawn}</Text>
          <Text style={[styles.summaryValue, { color: "rgba(255,255,255,0.7)" }]}>
            <Text style={[styles.summaryCurrency, { color: "rgba(255,255,255,0.4)" }]}>$</Text>
            {totalWithdrawn.toFixed(2)}
          </Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{t.transactions}</Text>
          <Text style={[styles.summaryValue, { color: "rgba(255,255,255,0.7)" }]}>
            {earnings.length}
          </Text>
        </View>
      </View>

      <View style={styles.tabBar}>
        {(["earnings", "withdrawals"] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab);
            }}
          >
            {activeTab === tab && (
              <LinearGradient
                colors={[Colors.green.dark, Colors.green.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Ionicons
              name={
                tab === "earnings"
                  ? activeTab === tab
                    ? "play-circle"
                    : "play-circle-outline"
                  : activeTab === tab
                  ? "wallet"
                  : "wallet-outline"
              }
              size={15}
              color={activeTab === tab ? "#fff" : "rgba(255,255,255,0.4)"}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab && styles.tabLabelActive,
              ]}
            >
              {tab === "earnings" ? t.earningsTab : t.withdrawalsTab}
            </Text>
            {tab === "earnings" && earnings.length > 0 && (
              <View style={[
                styles.tabBadge,
                activeTab === tab && styles.tabBadgeActive,
              ]}>
                <Text style={[
                  styles.tabBadgeText,
                  activeTab === tab && styles.tabBadgeTextActive,
                ]}>
                  {earnings.length}
                </Text>
              </View>
            )}
            {tab === "withdrawals" && withdrawals.length > 0 && (
              <View style={[
                styles.tabBadge,
                activeTab === tab && styles.tabBadgeActive,
              ]}>
                <Text style={[
                  styles.tabBadgeText,
                  activeTab === tab && styles.tabBadgeTextActive,
                ]}>
                  {withdrawals.length}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.green.primary} size="large" />
        </View>
      ) : activeTab === "earnings" ? (
        <FlatList
          data={earnings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EarningRow item={item} todayLabel={t.today} yesterdayLabel={t.yesterday} />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPadding + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState tab="earnings" t={t} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <FlatList
          data={withdrawals}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WithdrawalRow
              item={item}
              todayLabel={t.today}
              yesterdayLabel={t.yesterday}
              bankTransferLabel={t.bankTransfer}
              cardMethodLabel={t.cardMethod}
              statusPending={t.statusPending}
              statusCompleted={t.statusCompleted}
              statusRejected={t.statusRejected}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPadding + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState tab="withdrawals" t={t} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#060f1e" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  headerSpacer: { width: 38 },

  summaryRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  summaryCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  summarySep: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  summaryLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: 20,
    color: Colors.green.primary,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  summaryCurrency: {
    fontSize: 13,
    color: "rgba(46,204,90,0.6)",
    fontFamily: "Inter_600SemiBold",
  },

  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 11,
    overflow: "hidden",
  },
  tabActive: {
    shadowColor: Colors.green.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  tabLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_600SemiBold",
  },
  tabLabelActive: {
    color: "#fff",
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeActive: {
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  tabBadgeText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_700Bold",
  },
  tabBadgeTextActive: {
    color: "#fff",
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    flexGrow: 1,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  rowIconWrap: {},
  rowIconGradient: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  withdrawalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 15,
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
  rowDate: {
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular",
  },
  earningAmount: {
    fontSize: 16,
    color: Colors.green.primary,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  withdrawalRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  withdrawalAmount: {
    fontSize: 15,
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },

  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.3)",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
