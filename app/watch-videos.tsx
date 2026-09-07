import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useLanguage } from "@/context/LanguageContext";
import i18n from "@/lib/i18n";
import { useBalance } from "@/context/BalanceContext";
import {
  AD_EVENT_CLOSED,
  AD_EVENT_EARNED_REWARD,
  AD_EVENT_ERROR,
  AD_EVENT_LOADED,
  createRewardedAd,
  initializeAdMob,
  RewardedAdInstance,
} from "@/lib/admob";

const REWARDED_AD_UNIT_ID = "ca-app-pub-1994352225471806/6704573321";
const VIDEO_REWARD_USD = 0.05;

export default function WatchVideosScreen() {
  const insets = useSafeAreaInsets();
  const { lang } = useLanguage();
  const t = i18n[lang].watchVideos;
  const { addEarning } = useBalance();
  const rewardedAdRef = useRef<RewardedAdInstance | null>(null);
  const rewardGrantedRef = useRef(false);
  const [isAdLoaded, setIsAdLoaded] = useState(false);
  const [isShowing, setIsShowing] = useState(false);
  const [message, setMessage] = useState("");
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const loadRewardedAd = useCallback(() => {
    if (Platform.OS === "web") return;
    setIsAdLoaded(false);
    setMessage("");
    // Keep the same instance so the listeners remain attached after each close.
    rewardedAdRef.current?.load();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let mounted = true;
    initializeAdMob().catch(() => {});
    const ad = createRewardedAd(REWARDED_AD_UNIT_ID);
    rewardedAdRef.current = ad;
    if (!ad) return;

    const unsubscribeLoaded = ad.addAdEventListener(
      AD_EVENT_LOADED,
      () => mounted && setIsAdLoaded(true),
    );
    const unsubscribeReward = ad.addAdEventListener(
      AD_EVENT_EARNED_REWARD,
      async () => {
        if (!mounted || rewardGrantedRef.current) return;
        rewardGrantedRef.current = true;
        setMessage(t.earned);
        // AdMob only emits EARNED_REWARD after the user completes the ad.
        await addEarning(VIDEO_REWARD_USD, "Completed rewarded video");
      },
    );
    const unsubscribeClosed = ad.addAdEventListener(AD_EVENT_CLOSED, () => {
      if (!mounted) return;
      setIsShowing(false);
      setIsAdLoaded(false);
      if (!rewardGrantedRef.current) setMessage(t.closed);
      rewardGrantedRef.current = false;
      loadRewardedAd();
    });
    const unsubscribeError = ad.addAdEventListener(AD_EVENT_ERROR, () => {
      if (!mounted) return;
      setIsShowing(false);
      setIsAdLoaded(false);
      setMessage(t.error);
    });
    ad.load();

    return () => {
      mounted = false;
      unsubscribeLoaded();
      unsubscribeReward();
      unsubscribeClosed();
      unsubscribeError();
    };
  }, [addEarning, loadRewardedAd, t.closed, t.earned, t.error]);

  const showRewardedAd = async () => {
    if (Platform.OS === "web") {
      setMessage("Los anuncios están disponibles en la aplicación móvil.");
      return;
    }
    const ad = rewardedAdRef.current;
    if (!ad || !isAdLoaded || isShowing) {
      setMessage(t.unavailable);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    rewardGrantedRef.current = false;
    setMessage(t.watching);
    setIsShowing(true);
    try {
      await ad.show();
    } catch {
      setIsShowing(false);
      setIsAdLoaded(false);
      setMessage(t.error);
      loadRewardedAd();
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#060f1e", "#0a1628", "#0d2010"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t.header}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.center, { paddingBottom: bottomPadding + 24 }]}>
        <View style={styles.iconRing}>
          <LinearGradient
            colors={["rgba(46,204,90,0.18)", "rgba(26,122,54,0.08)"]}
            style={styles.iconRingGradient}
          >
            <Ionicons name="play-circle" size={64} color={Colors.green.primary} />
          </LinearGradient>
        </View>

        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>{t.badge}</Text>
        </View>

        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.subtitle}>{t.subtitle}</Text>
        <Text style={styles.reward}>{t.reward}</Text>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.watchBtn,
            (!isAdLoaded || isShowing) && styles.disabledBtn,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={showRewardedAd}
          disabled={isShowing}
        >
          {isShowing || (!isAdLoaded && Platform.OS !== "web") ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="play" size={18} color="#fff" />
          )}
          <Text style={styles.backBtnText}>
            {isShowing ? t.watching : !isAdLoaded && Platform.OS !== "web" ? t.loading : t.watchBtn}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={styles.backBtnText}>{t.backBtn}</Text>
        </Pressable>
      </View>
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
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  headerSpacer: { width: 38 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  iconRing: {
    borderRadius: 40,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.25)",
    marginBottom: 4,
  },
  iconRingGradient: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(46,204,90,0.12)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.3)",
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.green.primary,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: Colors.green.primary,
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 22,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 24,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: Colors.green.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 22,
    marginTop: 8,
    minWidth: 250,
    shadowColor: Colors.green.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  disabledBtn: {
    backgroundColor: "rgba(46,204,90,0.35)",
    shadowOpacity: 0,
  },
  reward: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.green.primary,
    textAlign: "center",
  },
  message: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },
  backBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
