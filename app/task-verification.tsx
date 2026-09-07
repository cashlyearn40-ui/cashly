import React, { useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useCurrency } from "@/context/CurrencyContext";
import { useLanguage } from "@/context/LanguageContext";
import i18n from "@/lib/i18n";

function PulsingDot() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.35,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0.2,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.pulsingRing,
        { transform: [{ scale: pulseAnim }], opacity: opacityAnim },
      ]}
    />
  );
}

function StepItem({
  label,
  done,
  index,
  isLast,
  inProgressLabel,
}: {
  label: string;
  done: boolean;
  index: number;
  isLast: boolean;
  inProgressLabel: string;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      delay: 600 + index * 150,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.stepRow, { opacity: fadeAnim }]}>
      <View style={styles.stepLeft}>
        <View
          style={[
            styles.stepDot,
            done ? styles.stepDotDone : styles.stepDotPending,
          ]}
        >
          {done ? (
            <Ionicons name="checkmark" size={12} color="#fff" />
          ) : (
            <View style={styles.stepDotInner} />
          )}
        </View>
        {!isLast && (
          <View
            style={[
              styles.stepLine,
              { backgroundColor: done ? Colors.green.primary : Colors.navy.border },
            ]}
          />
        )}
      </View>
      <Text
        style={[
          styles.stepLabel,
          { color: done ? "#fff" : "rgba(255,255,255,0.35)" },
        ]}
      >
        {label}
      </Text>
      {!done && index === 2 && (
        <View style={styles.stepPendingBadge}>
          <Text style={styles.stepPendingText}>{inProgressLabel}</Text>
        </View>
      )}
    </Animated.View>
  );
}

export default function TaskVerificationScreen() {
  const { formatShort } = useCurrency();
  const { lang } = useLanguage();
  const t = i18n[lang].taskVerification;
  const insets = useSafeAreaInsets();
  const { taskTitle, taskReward } = useLocalSearchParams<{
    taskId: string;
    taskTitle: string;
    taskReward: string;
  }>();

  const heroAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  const rewardAmount = parseFloat(taskReward ?? "0");

  const STEPS = [
    { id: 1, label: t.step1, done: true },
    { id: 2, label: t.step2, done: true },
    { id: 3, label: t.step3, done: false },
    { id: 4, label: t.step4, done: false },
  ];

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.spring(heroAnim, {
        toValue: 1,
        tension: 60,
        friction: 7,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

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
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.heroSection,
            {
              opacity: heroAnim,
              transform: [
                {
                  scale: heroAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.75, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <PulsingDot />
            <View style={styles.iconInner}>
              <MaterialCommunityIcons
                name="shield-check"
                size={44}
                color={Colors.green.primary}
              />
            </View>
          </View>
          <Text style={styles.heroTitle}>{t.heroTitle}</Text>
          <Text style={styles.heroSubtitle}>
            {t.heroSubtitle}{"\n"}
            <Text style={styles.heroTaskName}>{taskTitle}</Text>
          </Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.rewardCard,
            {
              opacity: contentAnim,
              transform: [
                {
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={["rgba(46,204,90,0.12)", "rgba(46,204,90,0.04)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.rewardRow}>
            <View>
              <Text style={styles.rewardLabel}>{t.rewardLabel}</Text>
              <Text style={styles.rewardAmount}>
                +{formatShort(rewardAmount)}
              </Text>
            </View>
            <View style={styles.clockBadge}>
              <Ionicons name="shield-checkmark" size={22} color={Colors.green.primary} />
              <Text style={styles.clockText}>{t.clockLabel}</Text>
            </View>
          </View>
          <View style={styles.rewardDivider} />
          <View style={styles.noticeRow}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color="#fbbf24"
            />
            <Text style={styles.noticeText}>
              {t.noticeText}{" "}
              <Text style={styles.noticeHighlight}>{t.noticeHighlight}</Text>
              {" "}{t.noticeEnd}
            </Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.stepsCard,
            {
              opacity: contentAnim,
              transform: [
                {
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.stepsTitle}>{t.stepsTitle}</Text>
          <View style={styles.stepsList}>
            {STEPS.map((step, index) => (
              <StepItem
                key={step.id}
                label={step.label}
                done={step.done}
                index={index}
                isLast={index === STEPS.length - 1}
                inProgressLabel={t.inProgress}
              />
            ))}
          </View>
        </Animated.View>
      </View>

      <View
        style={[styles.bottomActions, { paddingBottom: bottomPadding + 20 }]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.doneBtn,
            { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/(tabs)");
          }}
        >
          <LinearGradient
            colors={[Colors.green.dark, Colors.green.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.doneBtnGradient}
          >
            <Text style={styles.doneBtnText}>{t.backToDashboard}</Text>
            <Ionicons name="home-outline" size={18} color="#fff" />
          </LinearGradient>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.moreTasksBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Text style={styles.moreTasksText}>{t.moreTasksBtn}</Text>
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
    justifyContent: "space-between",
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.navy.card,
    borderWidth: 1,
    borderColor: Colors.navy.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 12,
  },
  iconContainer: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  pulsingRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: Colors.green.primary,
  },
  iconInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.green.muted,
    borderWidth: 1.5,
    borderColor: "rgba(46,204,90,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 22,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginTop: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  heroTaskName: {
    color: Colors.green.primary,
    fontFamily: "Inter_600SemiBold",
  },
  rewardCard: {
    backgroundColor: Colors.navy.card,
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.25)",
    borderRadius: 20,
    padding: 18,
    overflow: "hidden",
    gap: 14,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rewardLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  rewardAmount: {
    fontSize: 32,
    color: Colors.green.primary,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  clockBadge: {
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.green.muted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.25)",
  },
  clockText: {
    fontSize: 11,
    color: Colors.green.primary,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  rewardDivider: {
    height: 1,
    backgroundColor: Colors.navy.border,
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  noticeHighlight: {
    color: "#fbbf24",
    fontFamily: "Inter_600SemiBold",
  },
  stepsCard: {
    backgroundColor: Colors.navy.card,
    borderWidth: 1,
    borderColor: Colors.navy.border,
    borderRadius: 20,
    padding: 18,
    gap: 16,
  },
  stepsTitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  stepsList: { gap: 0 },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    minHeight: 36,
  },
  stepLeft: { alignItems: "center", width: 20 },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: {
    backgroundColor: Colors.green.primary,
  },
  stepDotPending: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: Colors.navy.border,
  },
  stepDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.navy.border,
  },
  stepLine: {
    width: 2,
    flex: 1,
    minHeight: 16,
    marginVertical: 3,
  },
  stepLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
    paddingTop: 1,
  },
  stepPendingBadge: {
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  stepPendingText: {
    fontSize: 11,
    color: "#f59e0b",
    fontFamily: "Inter_600SemiBold",
  },
  bottomActions: {
    paddingHorizontal: 20,
    gap: 12,
  },
  doneBtn: {
    borderRadius: 18,
    overflow: "hidden",
  },
  doneBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
  },
  doneBtnText: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  moreTasksBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  moreTasksText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Inter_500Medium",
  },
});
