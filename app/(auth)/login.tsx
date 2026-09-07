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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { lang } = useLanguage();
  const t = i18n[lang].login;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError(t.errRequired);
      return;
    }
    setError("");
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      const msg = e?.message ?? "";
      const friendly = msg.includes("Invalid")
          ? t.errInvalid
          : msg || t.errGeneric;
      setError(friendly);
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
        <View style={styles.logoSection}>
          <View style={styles.logoMark}>
            <Ionicons name="trending-up" size={28} color="#fff" />
          </View>
          <Text style={styles.logoText}>Cashly Earn</Text>
          <Text style={styles.logoTagline}>{t.tagline}</Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={15} color="#f87171" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

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
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                selectionColor={Colors.green.primary}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="rgba(255,255,255,0.35)"
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              { opacity: pressed || loading ? 0.85 : 1 },
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            <LinearGradient
              colors={[Colors.green.dark, Colors.green.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.loginButtonGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.loginButtonText}>{t.loginButton}</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.signupSeparator} />

        <Pressable
          style={({ pressed }) => [
            styles.signupCard,
            { opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(auth)/signup");
          }}
        >
          <Text style={styles.signupQuestion}>{t.noAccount}</Text>
          <View style={styles.signupCtaRow}>
            <Text style={styles.signupCta}>{t.signUp}</Text>
            <Ionicons name="arrow-forward" size={18} color="#39ff7a" />
          </View>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const INPUT_BG = "rgba(255,255,255,0.06)";
const INPUT_BORDER = "rgba(255,255,255,0.1)";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#060f1e" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    gap: 0,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 40,
    gap: 10,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 22,
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
  logoText: {
    fontSize: 32,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  logoTagline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_400Regular",
  },
  form: {
    gap: 16,
    marginBottom: 32,
  },
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
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
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
  eyeButton: {
    padding: 4,
    marginLeft: 4,
  },
  loginButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
  },
  loginButtonGradient: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
  },
  loginButtonText: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  signupSeparator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 8,
  },
  signupCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(57,255,122,0.06)",
    borderWidth: 1,
    borderColor: "rgba(57,255,122,0.25)",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginTop: 16,
  },
  signupQuestion: {
    fontSize: 16,
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter_500Medium",
  },
  signupCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  signupCta: {
    fontSize: 18,
    color: "#39ff7a",
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
