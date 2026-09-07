import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { CurrencyCode, CURRENCY_META } from "@/lib/currency";

export default function CurrencySelectScreen() {
  const insets = useSafeAreaInsets();
  const { logout, deleteAccount } = useAuth();
  const { setCurrency, currency, hasChosen } = useCurrency();
  const [selected, setSelected] = useState<CurrencyCode | null>(
    hasChosen ? currency : null
  );
  const [saving, setSaving] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const handleBack = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // If the user never confirmed (hasChosen === false), delete the account
    // created during signup — no account should persist
    // unless «Continuar» was pressed.
    if (!hasChosen) {
      await deleteAccount();
    }
    await logout();
    router.replace("/(auth)/login");
  };

  const handleSelect = (code: CurrencyCode) => {
    Haptics.selectionAsync();
    setSelected(code);
  };

  const handleContinue = async () => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      await setCurrency(selected);
      router.replace("/(tabs)");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.navy.darkest, Colors.navy.dark, "#0d2845"]}
        style={StyleSheet.absoluteFill}
      />

      <Pressable
        onPress={handleBack}
        hitSlop={10}
        style={[styles.backBtn, { top: topPadding + 12 }]}
      >
        <Ionicons name="chevron-back" size={22} color="#fff" />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPadding + 24, paddingBottom: bottomPadding + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
          <View style={styles.iconCircle}>
            <Ionicons name="cash" size={32} color={Colors.green.primary} />
          </View>
          <Text style={styles.title}>Elige tu moneda</Text>
          <Text style={styles.subtitle}>
            Toda la app —tablero, historial y retiros— se mostrará en la moneda
            que selecciones. Puedes cambiarla después en Ajustes.
          </Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.cardsWrap,
            { opacity: fade, transform: [{ translateY: slide }] },
          ]}
        >
          {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => {
            const meta = CURRENCY_META[code];
            const isActive = selected === code;
            return (
              <Pressable
                key={code}
                onPress={() => handleSelect(code)}
                style={[styles.card, isActive && styles.cardActive]}
              >
                {isActive && (
                  <LinearGradient
                    colors={["rgba(46,204,90,0.18)", "rgba(57,255,122,0.05)"]}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Text style={styles.flag}>{meta.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardCode}>
                    {meta.code}{" "}
                    <Text style={styles.cardSymbol}>{meta.symbol}</Text>
                  </Text>
                  <Text style={styles.cardName}>{meta.nameEs}</Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    isActive && styles.radioActive,
                  ]}
                >
                  {isActive && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </View>
              </Pressable>
            );
          })}

        </Animated.View>

        <View style={styles.spacer} />

        <Animated.View style={{ opacity: fade }}>
          <Pressable
            onPress={handleContinue}
            disabled={!selected || saving}
            style={[
              styles.continueBtn,
              (!selected || saving) && styles.continueBtnDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.continueText}>Continuar</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy.darkest },
  backBtn: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll:    { flex: 1 },
  content:   { flexGrow: 1, paddingHorizontal: 22 },
  spacer:    { minHeight: 24, flexGrow: 1 },

  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(46,204,90,0.15)",
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },

  cardsWrap: { marginTop: 32, gap: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    overflow: "hidden",
  },
  cardActive: {
    borderColor: Colors.green.primary,
    shadowColor: Colors.green.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  flag: { fontSize: 36 },
  cardCode: {
    fontSize: 17,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  cardSymbol: {
    color: Colors.green.primary,
    fontFamily: "Inter_600SemiBold",
  },
  cardName: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    backgroundColor: Colors.green.primary,
    borderColor: Colors.green.primary,
  },

  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.green.primary,
    paddingVertical: 17,
    borderRadius: 16,
    shadowColor: Colors.green.primary,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  continueBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)",
    shadowOpacity: 0,
  },
  continueText: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
});
