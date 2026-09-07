import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useBalance } from "@/context/BalanceContext";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useLanguage } from "@/context/LanguageContext";
import i18n from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { AppNotification } from "@/lib/notifications";
import { CURRENCY_META } from "@/lib/currency";

const PAYOUT_THRESHOLD = 25;

function BalanceCard() {
  const { balance, lifetime } = useBalance();
  const { currency, convert } = useCurrency();
  const { lang } = useLanguage();
  const t = i18n[lang].home;
  const meta = CURRENCY_META[currency];
  const displayBalance = convert(balance);
  const displayLifetime = convert(lifetime);

  // ── Mount animation ──────────────────────────────────────────────────────
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // ── Reward animations ────────────────────────────────────────────────────
  const balanceAtBlurRef = useRef<number>(-1);
  const currencyAtBlurRef = useRef(currency);
  const countAnim = useRef(new Animated.Value(displayBalance)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [countedDisplay, setCountedDisplay] = useState(displayBalance);
  const [showReward, setShowReward] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(0);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1, tension: 60, friction: 7, delay: 150, useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1, duration: 350, delay: 150, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Keep countedDisplay in sync when currency changes (no animation)
  useEffect(() => {
    setCountedDisplay(displayBalance);
    countAnim.setValue(displayBalance);
  }, [currency]);

  // Detect balance increase when screen regains focus
  useFocusEffect(
    useCallback(() => {
      const prevBalance = balanceAtBlurRef.current;
      const prevCurrency = currencyAtBlurRef.current;

      if (prevBalance >= 0 && balance > prevBalance && currency === prevCurrency) {
        const prevDisplay = convert(prevBalance);
        const newDisplay = convert(balance);
        const gained = convert(balance - prevBalance);

        setRewardAmount(gained);
        setShowReward(true);
        countAnim.setValue(prevDisplay);

        const listenerId = countAnim.addListener(({ value }) => {
          setCountedDisplay(value);
        });

        Animated.parallel([
          // Count up the number
          Animated.timing(countAnim, {
            toValue: newDisplay,
            duration: 1400,
            delay: 350,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          // Pulse scale
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.045, duration: 260, useNativeDriver: true }),
            Animated.spring(pulseAnim, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
          ]),
          // Glow — flash in, hold, fade out
          Animated.sequence([
            Animated.timing(glowOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
            Animated.delay(1000),
            Animated.timing(glowOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          ]),
        ]).start(({ finished }) => {
          countAnim.removeListener(listenerId);
          if (finished) {
            setCountedDisplay(newDisplay);
            setTimeout(() => setShowReward(false), 400);
          }
        });
      }

      // Cleanup: save balance when leaving screen
      return () => {
        balanceAtBlurRef.current = balance;
        currencyAtBlurRef.current = currency;
        countAnim.removeAllListeners();
      };
    }, [balance, currency])
  );

  const progressPercent = Math.min((balance / PAYOUT_THRESHOLD) * 100, 100);
  const minWithdrawalAmount = currency === "USD" ? 1 : 20;

  return (
    <Animated.View
      style={[
        styles.balanceContainer,
        {
          transform: [{ scale: scaleAnim }, { scale: pulseAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* Glow overlay — flashes green on reward */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.glowOverlay, { opacity: glowOpacity }]}
        pointerEvents="none"
      />

      <View style={styles.balanceTopRow}>
        <Text style={styles.balanceLabel}>{t.availableBalance}</Text>
        <View style={styles.currencyChip}>
          <Text style={styles.currencyChipFlag}>{meta.flag}</Text>
          <Text style={styles.currencyChipText}>{currency}</Text>
        </View>
      </View>

      <View style={styles.balanceRow}>
        <Text style={styles.balanceCurrency}>{meta.symbol}</Text>
        <Text style={styles.balanceAmount}>
          {countedDisplay.toLocaleString(meta.locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
      </View>

      {/* Reward badge — visible during animation */}
      {showReward && (
        <Animated.View style={[styles.rewardBadge, { opacity: glowOpacity }]}>
          <Ionicons name="add-circle" size={13} color={Colors.green.primary} />
          <Text style={styles.rewardBadgeText}>
            +{meta.symbol}
            {rewardAmount.toLocaleString(meta.locale, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {t.rewardAdded}
          </Text>
        </Animated.View>
      )}

      <View style={styles.balanceDivider} />
      <View style={styles.lifetimeRow}>
        <Ionicons name="trending-up" size={14} color={Colors.green.primary} />
        <Text style={styles.lifetimeText}>
          {meta.symbol}
          {displayLifetime.toLocaleString(meta.locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          {t.earnedLifetime}
        </Text>
      </View>
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarTrack}>
          <LinearGradient
            colors={[Colors.green.dark, Colors.green.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
          />
        </View>
        <Text style={styles.progressText}>
          {t.minimumWithdrawal}: {meta.symbol}{minWithdrawalAmount} {currency}
        </Text>
      </View>
    </Animated.View>
  );
}

function WatchVideosCard() {
  const { lang } = useLanguage();
  const t = i18n[lang].home;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay: 400,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 280,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(pressAnim, {
      toValue: 0.96,
      tension: 200,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      tension: 200,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/watch-videos");
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale: Animated.multiply(scaleAnim, pressAnim) }],
        opacity: opacityAnim,
      }}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={styles.watchVideosCard}>
          <LinearGradient
            colors={["rgba(46,204,90,0.12)", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.cardIconActive}>
            <Ionicons name="play-circle" size={28} color={Colors.green.primary} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.watchVideos}</Text>
            <Text style={styles.cardSubtitle}>{t.earnPerAd}</Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.cardComingSoon}>{t.comingSoon}</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color="rgba(255,255,255,0.4)"
            />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { lang } = useLanguage();
  const t = i18n[lang].home;
  const headerAnim = useRef(new Animated.Value(0)).current;

  const email = currentUser?.email ?? "";
  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["/api/user/notifications"],
    enabled: !!email,
    refetchInterval: 10000,
    staleTime: 5000,
  });
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, []);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  // Tab bar is position:absolute (~49px bar + safe area). Add full tab height so
  // the last card is never hidden behind it.
  const TAB_BAR_HEIGHT = Platform.OS === "web" ? 84 : 49;
  const bottomPadding = Platform.OS === "web" ? 84 + 24 : insets.bottom + TAB_BAR_HEIGHT + 24;

  const handleSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/settings");
  };

  const quickActions = [
    { icon: "wallet-outline", label: t.withdraw, gradient: true, onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/withdraw"); } },
    { icon: "bar-chart-outline", label: t.history, gradient: false, onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/history"); } },
    { icon: "gift-outline", label: t.rewards, gradient: false, onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/rewards"); } },
    { icon: "settings-outline", label: t.settings, gradient: false, onPress: handleSettings },
  ];

  const displayName = currentUser?.email?.split("@")[0] ?? "there";

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#060f1e", "#0a1628", "#0d2010"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topPadding + 16, paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.header,
            {
              opacity: headerAnim,
              transform: [
                {
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-10, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <View style={styles.logoMark}>
              <Ionicons name="trending-up" size={16} color="#fff" />
            </View>
            <View>
              <Text style={styles.welcomeText}>{t.welcomeBack} {displayName}</Text>
              <Text style={styles.appName}>{t.appName}</Text>
            </View>
          </View>
          <Pressable
            style={styles.notifButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/notifications");
            }}
          >
            <Feather name="bell" size={20} color="rgba(255,255,255,0.8)" />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </Animated.View>

        <BalanceCard />

        <View style={styles.quickActions}>
          {quickActions.map((action) => (
            <Pressable
              key={action.label}
              style={styles.quickAction}
              onPress={action.onPress}
            >
              {action.gradient ? (
                <LinearGradient
                  colors={[Colors.green.dark, Colors.green.primary]}
                  style={styles.quickActionGradient}
                >
                  <Ionicons name={action.icon as any} size={18} color="#fff" />
                </LinearGradient>
              ) : (
                <View style={styles.quickActionSecondary}>
                  <Ionicons name={action.icon as any} size={18} color={Colors.green.primary} />
                </View>
              )}
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.earnMore}</Text>
        </View>

        <WatchVideosCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#060f1e" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, gap: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.green.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
  appName: {
    fontSize: 20,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  notifButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.navy.card,
    borderWidth: 1,
    borderColor: Colors.navy.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0a1628",
  },
  notifBadgeText: {
    fontSize: 10,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
  balanceContainer: {
    backgroundColor: Colors.navy.card,
    borderWidth: 1,
    borderColor: Colors.navy.border,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    alignItems: "center",
    overflow: "hidden",
  },
  glowOverlay: {
    backgroundColor: "rgba(46,204,90,0.13)",
    borderRadius: 24,
  },
  rewardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(46,204,90,0.12)",
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.3)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 6,
    marginBottom: 2,
  },
  rewardBadgeText: {
    fontSize: 13,
    color: Colors.green.primary,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },
  balanceTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  currencyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(46,204,90,0.12)",
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.3)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currencyChipFlag: { fontSize: 13 },
  currencyChipText: {
    fontSize: 11,
    color: Colors.green.primary,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  balanceLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  balanceRow: { flexDirection: "row", alignItems: "flex-start" },
  balanceCurrency: {
    fontSize: 28,
    color: Colors.green.primary,
    fontFamily: "Inter_700Bold",
    marginTop: 6,
  },
  balanceAmount: {
    fontSize: 56,
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -2,
    lineHeight: 60,
  },
  balanceDivider: {
    width: "100%",
    height: 1,
    backgroundColor: Colors.navy.border,
    marginVertical: 16,
  },
  lifetimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  lifetimeText: {
    fontSize: 13,
    color: Colors.green.primary,
    fontFamily: "Inter_500Medium",
  },
  progressBarContainer: { width: "100%", gap: 8 },
  progressBarTrack: {
    width: "100%",
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: { height: "100%", borderRadius: 3 },
  progressText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
    gap: 12,
  },
  quickAction: { flex: 1, alignItems: "center", gap: 8 },
  quickActionGradient: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionSecondary: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.navy.card,
    borderWidth: 1,
    borderColor: Colors.navy.border,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  watchVideosCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.navy.card,
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.3)",
    borderRadius: 18,
    padding: 16,
    gap: 14,
    overflow: "hidden",
  },
  cardIconActive: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(46,204,90,0.2)",
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: { flex: 1, gap: 3 },
  cardTitle: {
    fontSize: 15,
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Inter_400Regular",
  },
  cardRight: {
    alignItems: "center",
    gap: 4,
    flexDirection: "row",
    alignSelf: "center",
  },
  cardComingSoon: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_500Medium",
  },
});
