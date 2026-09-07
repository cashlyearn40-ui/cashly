import React, { useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import i18n from "@/lib/i18n";
import Colors from "@/constants/colors";

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { signup } = useAuth();
  const { lang } = useLanguage();
  const t = i18n[lang].signup;

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef  = useRef<TextInput>(null);

  const topPadding    = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Email signup ─────────────────────────────────────────────────────────
  const handleSignup = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) { setError(t.errEmailRequired); return; }
    if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      setError(t.errEmailInvalid); return;
    }
    if (password.length < 6) { setError(t.errPasswordShort); return; }
    if (password !== confirm) { setError(t.errPasswordMatch); return; }

    setError("");
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await signup(trimmedEmail, password);
    } catch (e: any) {
      const msg = e?.message ?? "";
      setError(msg || t.errGeneric);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#060f1e", "#0a1628", "#0d2010"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPadding + 24, paddingBottom: bottomPadding + 24 },
        ]}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.logoMark}>
            <Ionicons name="trending-up" size={28} color="#fff" />
          </View>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle}</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={15} color="#f87171" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.emailLabel}</Text>
            <View style={styles.inputWrap}>
              <Ionicons
                name="mail-outline"
                size={18}
                color="rgba(255,255,255,0.35)"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder={t.emailPlaceholder}
                placeholderTextColor="rgba(255,255,255,0.25)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                selectionColor={Colors.green.primary}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.passwordLabel}</Text>
            <View style={styles.inputWrap}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color="rgba(255,255,255,0.35)"
                style={styles.inputIcon}
              />
              <TextInput
                ref={passwordRef}
                style={[styles.input, styles.inputWithToggle]}
                value={password}
                onChangeText={setPassword}
                placeholder={t.passwordPlaceholder}
                placeholderTextColor="rgba(255,255,255,0.25)"
                secureTextEntry={!showPass}
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                selectionColor={Colors.green.primary}
              />
              <Pressable
                onPress={() => setShowPass((v) => !v)}
                style={styles.eyeButton}
                hitSlop={8}
              >
                <Ionicons
                  name={showPass ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="rgba(255,255,255,0.35)"
                />
              </Pressable>
            </View>
          </View>

          {/* Confirm password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.confirmLabel}</Text>
            <View style={styles.inputWrap}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color="rgba(255,255,255,0.35)"
                style={styles.inputIcon}
              />
              <TextInput
                ref={confirmRef}
                style={[styles.input, styles.inputWithToggle]}
                value={confirm}
                onChangeText={setConfirm}
                placeholder={t.confirmPlaceholder}
                placeholderTextColor="rgba(255,255,255,0.25)"
                secureTextEntry={!showConfirm}
                returnKeyType="done"
                onSubmitEditing={handleSignup}
                selectionColor={Colors.green.primary}
              />
              <Pressable
                onPress={() => setShowConfirm((v) => !v)}
                style={styles.eyeButton}
                hitSlop={8}
              >
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="rgba(255,255,255,0.35)"
                />
              </Pressable>
            </View>
          </View>

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [
              styles.createButton,
              { opacity: pressed || loading ? 0.85 : 1 },
            ]}
            onPress={handleSignup}
            disabled={loading}
          >
            <LinearGradient
              colors={[Colors.green.dark, Colors.green.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.createButtonGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.createButtonText}>{t.createButton}</Text>
              )}
            </LinearGradient>
          </Pressable>

          {/* Terms */}
          <Text style={styles.terms}>
            {t.terms}{" "}
            <Text style={styles.termsLink}>{t.termsLink}</Text>
            {" "}{t.and}{" "}
            <Text style={styles.termsLink}>{t.privacyLink}</Text>
          </Text>
        </View>

        {/* Back to login */}
        <View style={styles.loginSeparator} />
        <Pressable
          style={({ pressed }) => [
            styles.loginCard,
            { opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace("/(auth)/login");
          }}
        >
          <Text style={styles.loginQuestion}>{t.haveAccount}</Text>
          <Text style={styles.loginCta}>{t.logIn}</Text>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const INPUT_BG     = "rgba(255,255,255,0.06)";
const INPUT_BORDER = "rgba(255,255,255,0.1)";

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#060f1e" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 0 },

  // Header
  headerSection: {
    alignItems: "center",
    marginBottom: 32,
    gap: 8,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.green.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    shadowColor: Colors.green.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontSize: 28,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_400Regular",
  },

  // Form
  form: { gap: 16 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(248,113,113,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    fontSize: 13,
    color: "#f87171",
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  inputGroup: { gap: 8 },
  inputLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_500Medium",
    marginLeft: 2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  inputWithToggle: { paddingRight: 8 },
  eyeButton: { padding: 4 },

  // Create button
  createButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
  },
  createButtonGradient: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
  },
  createButtonText: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },

  // Terms
  terms: {
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
  termsLink: {
    color: Colors.green.primary,
    fontFamily: "Inter_500Medium",
  },

  // Back to login
  loginSeparator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 8,
    marginTop: 20,
  },
  loginCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(57,255,122,0.06)",
    borderWidth: 1,
    borderColor: "rgba(57,255,122,0.25)",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginTop: 8,
  },
  loginQuestion: {
    fontSize: 15,
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Inter_500Medium",
  },
  loginCta: {
    fontSize: 15,
    color: Colors.green.primary,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    ...Platform.select({
      web: { textShadow: "0 0 12px rgba(57,255,122,0.6)" as any },
      default: {
        textShadowColor: "rgba(57,255,122,0.6)",
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 12,
      },
    }),
  },
});
