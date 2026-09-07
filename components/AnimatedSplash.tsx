import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const APP_NAME = "Cashly Earn";
const TYPE_INTERVAL_MS = 90;
const HOLD_AFTER_TYPE_MS = 350;
const FADE_DURATION_MS = 500;

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const spin = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const [typed, setTyped] = useState("");

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();

    const spinAnim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spinAnim.start();

    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTyped(APP_NAME.slice(0, i));
      if (i >= APP_NAME.length) clearInterval(interval);
    }, TYPE_INTERVAL_MS);

    const totalTypingMs = APP_NAME.length * TYPE_INTERVAL_MS;
    const fadeStartTimer = setTimeout(() => {
      spinAnim.stop();
      Animated.timing(spin, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      Animated.timing(fade, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, totalTypingMs + HOLD_AFTER_TYPE_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(fadeStartTimer);
      spinAnim.stop();
    };
  }, [fade, spin, logoScale, onFinish]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]} pointerEvents="none">
      <StatusBar hidden style="light" />
      <LinearGradient
        colors={["#0a1628", "#0a1628", "#0d2010"]}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        <Animated.View style={{ transform: [{ scale: logoScale }, { rotate }] }}>
          <LinearGradient
            colors={["#34d96e", "#1a7a36"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoCircle}
          >
            <View style={styles.logoInner}>
              <Text style={styles.logoText}>CE</Text>
              <View style={styles.dollarPin}>
                <Ionicons name="trending-up" size={14} color="#fff" />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={styles.nameRow}>
          <Text style={styles.name}>
            {typed}
            <Text style={styles.caret}>{typed.length < APP_NAME.length ? "|" : " "}</Text>
          </Text>
        </View>

        <Text style={styles.tagline}>Earn real cash, anytime</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#0a1628",
    zIndex: 9999,
    elevation: 9999,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2ecc5a",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  logoInner: {
    width: 108,
    height: 108,
    borderRadius: 26,
    backgroundColor: "rgba(10,22,40,0.4)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  logoText: {
    fontSize: 52,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -2,
    ...Platform.select({
      web: { textShadow: "0 2px 12px rgba(46,204,90,0.6)" as any },
      default: {
        textShadowColor: "rgba(46,204,90,0.6)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 12,
      },
    }),
  },
  dollarPin: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#2ecc5a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0a1628",
  },
  nameRow: { flexDirection: "row", alignItems: "center", height: 38 },
  name: {
    fontSize: 30,
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  caret: {
    color: "#2ecc5a",
    fontFamily: "Inter_400Regular",
  },
  tagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    marginTop: -10,
  },
});
