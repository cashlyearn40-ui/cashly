import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";

const KEYS = ["1","2","3","4","5","6","7","8","9","C","0","⌫"] as const;

export default function PinVerifyScreen() {
  const { verifyAdminPin, logout, isAdminPinVerified } = useAuth();

  const [pin, setPin]           = useState("");
  const [error, setError]       = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [locked, setLocked]     = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);
  const [loading, setLoading]   = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Navigate to admin panel once PIN is verified
  useEffect(() => {
    if (isAdminPinVerified) {
      router.replace("/(admin)");
    }
  }, [isAdminPinVerified]);

  // Countdown timer when locked
  useEffect(() => {
    if (!locked || lockRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval);
          setLocked(false);
          setError("");
          return 0;
        }
        return r - 1;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [locked]);

  const shake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleKey = (key: string) => {
    if (locked || loading) return;

    if (key === "C") {
      setPin("");
      setError("");
      if (Platform.OS !== "web") Haptics.selectionAsync();
      return;
    }
    if (key === "⌫") {
      setPin((p) => p.slice(0, -1));
      setError("");
      if (Platform.OS !== "web") Haptics.selectionAsync();
      return;
    }
    if (pin.length >= 4) return;

    const next = pin + key;
    setPin(next);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (next.length === 4) {
      submitPin(next);
    }
  };

  const submitPin = async (pinValue: string) => {
    setLoading(true);
    setError("");
    try {
      await verifyAdminPin(pinValue);
      // isAdminPinVerified will flip to true → useEffect navigates away
    } catch (e: any) {
      setPin("");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake();

      // Parse server response
      let msg = "PIN incorrecto.";
      let isLocked = false;
      let remaining = 0;
      let left = 5;

      try {
        // apiRequest throws with message like "401: {json}"
        const raw = e?.message ?? "";
        const jsonStart = raw.indexOf("{");
        if (jsonStart !== -1) {
          const parsed = JSON.parse(raw.slice(jsonStart));
          msg = parsed.message ?? msg;
          isLocked = parsed.locked ?? false;
          remaining = parsed.remaining ?? 0;
          left = parsed.attemptsLeft ?? left;
        }
      } catch {}

      if (isLocked) {
        setLocked(true);
        setLockRemaining(remaining);
        setError(`Bloqueado por ${remaining} minuto(s).`);
      } else {
        setAttemptsLeft(left);
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  return (
    <View style={s.root}>
      <LinearGradient
        colors={["#060f1e", "#0a1628", "#0d2010"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Header ── */}
      <View style={s.header}>
        <Pressable style={s.logoutBtn} onPress={handleLogout} hitSlop={12}>
          <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </View>

      {/* ── Icon & title ── */}
      <View style={s.center}>
        <View style={[s.iconWrap, locked && s.iconWrapLocked]}>
          <Ionicons
            name={locked ? "lock-closed" : "shield-checkmark"}
            size={36}
            color={locked ? "#f87171" : Colors.green.primary}
          />
        </View>

        <Text style={s.title}>Panel de Administrador</Text>
        <Text style={s.subtitle}>
          {locked
            ? `Bloqueado · espera ${lockRemaining} min`
            : "Ingresa tu PIN de seguridad"}
        </Text>

        {/* ── PIN dots ── */}
        <Animated.View
          style={[s.dotsRow, { transform: [{ translateX: shakeAnim }] }]}
        >
          {[0, 1, 2, 3].map((i) => {
            const filled = i < pin.length;
            const errored = !!error && pin.length === 0;
            return (
              <View
                key={i}
                style={[
                  s.dot,
                  filled && s.dotFilled,
                  errored && s.dotError,
                  locked && s.dotLocked,
                ]}
              />
            );
          })}
        </Animated.View>

        {/* ── Error / loading ── */}
        <View style={s.feedbackRow}>
          {loading ? (
            <ActivityIndicator color={Colors.green.primary} size="small" />
          ) : error ? (
            <Text style={[s.errorText, locked && s.errorLocked]}>{error}</Text>
          ) : (
            <Text style={s.attemptsText}>
              {!locked && attemptsLeft < 5 ? `${attemptsLeft} intento(s) restante(s)` : ""}
            </Text>
          )}
        </View>
      </View>

      {/* ── Number pad ── */}
      <View style={s.pad}>
        {KEYS.map((key) => {
          const isAction = key === "C" || key === "⌫";
          const isDisabled = locked || loading;
          return (
            <Pressable
              key={key}
              style={({ pressed }) => [
                s.key,
                isAction && s.keyAction,
                pressed && !isDisabled && s.keyPressed,
                isDisabled && s.keyDisabled,
              ]}
              onPress={() => handleKey(key)}
              disabled={isDisabled}
            >
              {key === "⌫" ? (
                <Ionicons name="backspace-outline" size={22} color={isDisabled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)"} />
              ) : (
                <Text style={[s.keyText, isAction && s.keyActionText, isDisabled && s.keyTextDisabled]}>
                  {key}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={s.footer}>
        <View style={s.liveDotWrap}>
          <View style={s.liveDot} />
          <Text style={s.footerText}>Verificación de 2 factores · Cashly Earn</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: "#060f1e" },
  header:          { paddingTop: Platform.OS === "web" ? 24 : 56, paddingHorizontal: 20, alignItems: "flex-end" },
  logoutBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },

  center:          { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  iconWrap:        { width: 80, height: 80, borderRadius: 24, backgroundColor: "rgba(46,204,90,0.12)", borderWidth: 1, borderColor: "rgba(46,204,90,0.25)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  iconWrapLocked:  { backgroundColor: "rgba(248,113,113,0.1)", borderColor: "rgba(248,113,113,0.25)" },

  title:           { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  subtitle:        { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", textAlign: "center" },

  dotsRow:         { flexDirection: "row", gap: 20, marginTop: 8 },
  dot:             { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "rgba(255,255,255,0.2)", backgroundColor: "transparent" },
  dotFilled:       { backgroundColor: Colors.green.primary, borderColor: Colors.green.primary },
  dotError:        { borderColor: "#f87171" },
  dotLocked:       { borderColor: "rgba(248,113,113,0.3)" },

  feedbackRow:     { height: 20, alignItems: "center", justifyContent: "center" },
  errorText:       { fontSize: 13, fontFamily: "Inter_500Medium", color: "#f87171", textAlign: "center" },
  errorLocked:     { color: "#f87171" },
  attemptsText:    { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)", textAlign: "center" },

  pad:             { paddingHorizontal: 32, paddingBottom: 16, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: 320, alignSelf: "center" },
  key:             { width: 80, height: 72, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  keyAction:       { backgroundColor: "rgba(255,255,255,0.03)" },
  keyPressed:      { backgroundColor: "rgba(46,204,90,0.15)", borderColor: "rgba(46,204,90,0.3)" },
  keyDisabled:     { opacity: 0.3 },
  keyText:         { fontSize: 24, fontFamily: "Inter_500Medium", color: "#fff" },
  keyActionText:   { fontSize: 15, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.6)" },
  keyTextDisabled: { color: "rgba(255,255,255,0.25)" },

  footer:          { paddingBottom: Platform.OS === "web" ? 24 : 40, alignItems: "center" },
  liveDotWrap:     { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot:         { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.green.primary },
  footerText:      { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.25)" },
});
