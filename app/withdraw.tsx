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
import { useBalance } from "@/context/BalanceContext";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useLanguage } from "@/context/LanguageContext";
import i18n from "@/lib/i18n";
import { CURRENCY_META, USD_TO_MXN } from "@/lib/currency";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

type AccountType = "CLABE" | "CARD";

const MIN_MXN = 20;
const MIN_USD = 1;

export default function WithdrawScreen() {
  const insets = useSafeAreaInsets();
  const { balance } = useBalance();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { currency, convert, formatShort } = useCurrency();
  const { lang } = useLanguage();
  const t = i18n[lang].withdraw;
  const meta = CURRENCY_META[currency];
  const rate = currency === "USD" ? 1 : USD_TO_MXN;
  const displayBalance = convert(balance);

  const minDisplayAmount = currency === "MXN" ? MIN_MXN : MIN_USD;
  const minLabel = `${meta.symbol}${minDisplayAmount.toFixed(2)} ${currency}`;

  const [accountType, setAccountType] = useState<AccountType>(
    currency === "USD" ? "CARD" : "CLABE"
  );
  const accountDigits = accountType === "CLABE" ? 18 : 16;

  const [amount, setAmount] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bank, setBank] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const accountRef = useRef<TextInput>(null);
  const bankRef = useRef<TextInput>(null);

  const handleAmountChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const formatted =
      parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
    setAmount(formatted);
    if (error) setError("");
  };

  const handleAccountNumberChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, "").slice(0, accountDigits);
    setAccountNumber(digits);
    if (error) setError("");
  };

  const switchAccountType = (type: AccountType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAccountType(type);
    setAccountNumber("");
    if (error) setError("");
  };

  const handleSubmit = async () => {
    const parsedDisplay = parseFloat(amount);

    if (!amount || isNaN(parsedDisplay) || parsedDisplay <= 0) {
      setError(t.errAmount);
      return;
    }
    if (parsedDisplay < minDisplayAmount) {
      setError(t.errMin(minLabel));
      return;
    }
    if (parsedDisplay > displayBalance) {
      setError(t.errBalance);
      return;
    }
    if (!beneficiaryName.trim()) {
      setError(t.errName);
      return;
    }
    if (accountNumber.length !== accountDigits) {
      setError(t.errAccount(accountDigits));
      return;
    }
    if (accountType === "CLABE" && !bank.trim()) {
      setError(t.errBank);
      return;
    }

    setError("");
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const amountUsd = parsedDisplay / rate;
      const detail = JSON.stringify({
        name: beneficiaryName.trim(),
        accountType,
        accountNumber,
        bank: bank.trim(),
      });
      await apiRequest("POST", "/api/user/withdraw", {
        amount: amountUsd,
        method: accountType,
        detail,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/history"] });
      setSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e?.message ?? t.errGeneric);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={["#060f1e", "#0a1628", "#0d2010"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.successContainer,
            { paddingTop: topPadding + 24, paddingBottom: bottomPadding + 24 },
          ]}
        >
          <View style={styles.successIconWrap}>
            <LinearGradient
              colors={[Colors.green.dark, Colors.green.primary]}
              style={styles.successIconGradient}
            >
              <Ionicons name="checkmark" size={36} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={styles.successTitle}>{t.successTitle}</Text>
          <Text style={styles.successMessage}>{t.successMsg}</Text>
          <View style={styles.successDetails}>
            <SuccessRow
              label={t.labelAmount}
              value={`${meta.symbol}${parseFloat(amount).toLocaleString(meta.locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} ${currency}`}
            />
            <View style={styles.successDetailDivider} />
            <SuccessRow label={t.labelBeneficiary} value={beneficiaryName.trim()} />
            <View style={styles.successDetailDivider} />
            <SuccessRow label={t.labelAccountType} value={accountType} />
            <View style={styles.successDetailDivider} />
            <SuccessRow
              label={t.labelAccount}
              value={`${"•".repeat(accountDigits - 4)}${accountNumber.slice(-4)}`}
            />
            {accountType === "CLABE" && bank.trim() ? (
              <>
                <View style={styles.successDetailDivider} />
                <SuccessRow label={t.labelBank} value={bank.trim()} />
              </>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [styles.doneButton, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.back()}
          >
            <LinearGradient
              colors={[Colors.green.dark, Colors.green.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.doneButtonGradient}
            >
              <Text style={styles.doneButtonText}>{t.doneBtn}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

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
          { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 32 },
        ]}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.navRow}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.navTitle}>{t.title}</Text>
          <View style={styles.navSpacer} />
        </View>

        {/* ── Balance card ── */}
        <View style={styles.balanceCard}>
          <LinearGradient
            colors={["rgba(46,204,90,0.12)", "rgba(26,122,54,0.08)"]}
            style={styles.balanceCardGradient}
          >
            <Text style={styles.balanceLabel}>{t.balanceLabel} ({currency})</Text>
            <Text style={styles.balanceValue}>
              <Text style={styles.balanceDollar}>{meta.symbol}</Text>
              {displayBalance.toLocaleString(meta.locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            {displayBalance < minDisplayAmount && (
              <View style={styles.balanceWarning}>
                <Ionicons name="information-circle-outline" size={14} color="rgba(255,220,80,0.8)" />
                <Text style={styles.balanceWarningText}>
                  {t.needMore(minLabel)}
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ── Amount ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t.amountSection}</Text>
          <View style={styles.amountInputWrap}>
            <Text style={styles.amountDollarSign}>{meta.symbol}</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={handleAmountChange}
              placeholder="0.00"
              placeholderTextColor="rgba(255,255,255,0.2)"
              keyboardType="decimal-pad"
              returnKeyType="next"
              selectionColor={Colors.green.primary}
              onSubmitEditing={() => accountRef.current?.focus()}
            />
            <Text style={styles.amountCurrencyTag}>{currency}</Text>
          </View>
          <Text style={styles.minNote}>{t.minNote(minLabel)}</Text>
        </View>

        {/* ── Account type selector ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t.accountTypeLabel}</Text>
          <View style={styles.segmentedControl}>
            <Pressable
              style={[styles.segmentBtn, accountType === "CLABE" && styles.segmentBtnActive]}
              onPress={() => switchAccountType("CLABE")}
            >
              <Ionicons
                name="business-outline"
                size={16}
                color={accountType === "CLABE" ? "#fff" : "rgba(255,255,255,0.4)"}
              />
              <Text style={[styles.segmentText, accountType === "CLABE" && styles.segmentTextActive]}>
                {t.clabeOption}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, accountType === "CARD" && styles.segmentBtnActive]}
              onPress={() => switchAccountType("CARD")}
            >
              <Ionicons
                name="card-outline"
                size={16}
                color={accountType === "CARD" ? "#fff" : "rgba(255,255,255,0.4)"}
              />
              <Text style={[styles.segmentText, accountType === "CARD" && styles.segmentTextActive]}>
                {t.cardOption}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Bank details ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t.bankSection}</Text>

          {/* Beneficiary name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t.nameLabel}</Text>
            <View style={styles.inputWrap}>
              <Ionicons
                name="person-outline"
                size={18}
                color="rgba(255,255,255,0.35)"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={beneficiaryName}
                onChangeText={(text) => { setBeneficiaryName(text); if (error) setError(""); }}
                placeholder={t.namePlaceholder}
                placeholderTextColor="rgba(255,255,255,0.25)"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                selectionColor={Colors.green.primary}
                onSubmitEditing={() => accountRef.current?.focus()}
              />
            </View>
          </View>

          {/* Account number — adapts to CLABE (18d) or CARD (16d) */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Text style={styles.inputLabel}>{t.accountNumLabel}</Text>
              <Text
                style={[
                  styles.inputLabelHint,
                  accountNumber.length === accountDigits && { color: Colors.green.primary },
                ]}
              >
                {accountNumber.length}/{accountDigits}
              </Text>
            </View>
            <View
              style={[
                styles.inputWrap,
                accountNumber.length > 0 && accountNumber.length < accountDigits && styles.inputWrapError,
                accountNumber.length === accountDigits && styles.inputWrapSuccess,
              ]}
            >
              <Ionicons
                name={accountType === "CARD" ? "card-outline" : "business-outline"}
                size={18}
                color={
                  accountNumber.length === accountDigits
                    ? Colors.green.primary
                    : "rgba(255,255,255,0.35)"
                }
                style={styles.inputIcon}
              />
              <TextInput
                ref={accountRef}
                style={[styles.input, styles.accountInput]}
                value={accountNumber}
                onChangeText={handleAccountNumberChange}
                placeholder={
                  accountType === "CLABE" ? t.clabePlaceholder : t.cardNumPlaceholder
                }
                placeholderTextColor="rgba(255,255,255,0.25)"
                keyboardType="number-pad"
                returnKeyType={accountType === "CLABE" ? "next" : "done"}
                maxLength={accountDigits}
                selectionColor={Colors.green.primary}
                onSubmitEditing={() =>
                  accountType === "CLABE" ? bankRef.current?.focus() : undefined
                }
              />
              {accountNumber.length === accountDigits && (
                <Ionicons name="checkmark-circle" size={18} color={Colors.green.primary} />
              )}
            </View>
            {accountNumber.length > 0 && accountNumber.length < accountDigits && (
              <Text style={styles.fieldError}>{t.errAccount(accountDigits)}</Text>
            )}
          </View>

          {/* Bank institution — only for CLABE */}
          {accountType === "CLABE" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t.bankLabel}</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="storefront-outline"
                  size={18}
                  color="rgba(255,255,255,0.35)"
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={bankRef}
                  style={styles.input}
                  value={bank}
                  onChangeText={(text) => { setBank(text); if (error) setError(""); }}
                  placeholder={t.bankPlaceholder}
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  selectionColor={Colors.green.primary}
                  onSubmitEditing={handleSubmit}
                />
              </View>
            </View>
          )}
        </View>

        {/* ── Error banner ── */}
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color="#f87171" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── Submit button ── */}
        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            { opacity: pressed || loading ? 0.85 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <LinearGradient
            colors={[Colors.green.dark, Colors.green.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitButtonGradient}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={18} color="#fff" />
                <Text style={styles.submitButtonText}>{t.submitBtn}</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>

        {/* ── Security / privacy notice ── */}
        <View style={styles.securityBox}>
          <Text style={styles.securityText}>{t.securityText}</Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function SuccessRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.successDetailRow}>
      <Text style={styles.successDetailLabel}>{label}</Text>
      <Text style={styles.successDetailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const INPUT_BG = "rgba(255,255,255,0.06)";
const INPUT_BORDER = "rgba(255,255,255,0.1)";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#060f1e" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 24 },

  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
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
  navTitle: { fontSize: 17, color: "#fff", fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  navSpacer: { width: 38 },

  balanceCard: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(46,204,90,0.2)" },
  balanceCardGradient: { paddingVertical: 24, alignItems: "center", gap: 8 },
  balanceLabel: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  balanceValue: { fontSize: 48, color: "#fff", fontFamily: "Inter_700Bold", letterSpacing: -2, lineHeight: 56 },
  balanceDollar: { fontSize: 28, color: "rgba(255,255,255,0.6)" },
  balanceWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,220,80,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,220,80,0.2)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  balanceWarningText: { fontSize: 12, color: "rgba(255,220,80,0.8)", fontFamily: "Inter_500Medium" },

  section: { gap: 14 },
  sectionLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  amountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 64,
    gap: 4,
  },
  amountDollarSign: { fontSize: 28, color: "rgba(255,255,255,0.4)", fontFamily: "Inter_600SemiBold" },
  amountCurrencyTag: { fontSize: 13, color: Colors.green.primary, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginRight: 4 },
  amountInput: { flex: 1, fontSize: 36, color: "#fff", fontFamily: "Inter_700Bold", letterSpacing: -1 },
  minNote: { fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "Inter_400Regular", marginLeft: 4 },

  // ── Segmented control ──
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  segmentBtnActive: {
    backgroundColor: Colors.green.dark,
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.35)",
  },
  segmentText: { fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "Inter_600SemiBold" },
  segmentTextActive: { color: "#fff" },

  inputGroup: { gap: 8 },
  inputLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inputLabel: { fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_500Medium" },
  inputLabelHint: { fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "Inter_400Regular" },
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
  inputWrapError: { borderColor: "rgba(248,113,113,0.5)" },
  inputWrapSuccess: { borderColor: "rgba(46,204,90,0.4)" },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: "#fff", fontFamily: "Inter_400Regular", height: "100%" },
  accountInput: { fontSize: 18, fontFamily: "Inter_600SemiBold", letterSpacing: 2 },
  fieldError: { fontSize: 12, color: "#f87171", fontFamily: "Inter_400Regular", marginLeft: 4, marginTop: 2 },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(248,113,113,0.1)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: { fontSize: 14, color: "#f87171", fontFamily: "Inter_600SemiBold", flex: 1 },

  submitButton: { borderRadius: 16, overflow: "hidden" },
  submitButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
    gap: 8,
  },
  submitButtonText: { fontSize: 16, color: "#fff", fontFamily: "Inter_700Bold", letterSpacing: -0.2 },

  // ── Security notice ──
  securityBox: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  securityText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    textAlign: "center",
  },

  // ── Success screen ──
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 20 },
  successIconWrap: {
    borderRadius: 36,
    overflow: "hidden",
    marginBottom: 8,
    shadowColor: Colors.green.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  successIconGradient: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 26, color: "#fff", fontFamily: "Inter_700Bold", letterSpacing: -0.8 },
  successMessage: { fontSize: 15, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  successDetails: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 20,
    gap: 14,
    marginVertical: 8,
  },
  successDetailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  successDetailLabel: { fontSize: 13, color: "rgba(255,255,255,0.4)", fontFamily: "Inter_500Medium" },
  successDetailValue: { fontSize: 14, color: "#fff", fontFamily: "Inter_600SemiBold", maxWidth: "60%", textAlign: "right" },
  successDetailDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)" },
  doneButton: { width: "100%", borderRadius: 16, overflow: "hidden" },
  doneButtonGradient: { alignItems: "center", justifyContent: "center", paddingVertical: 17 },
  doneButtonText: { fontSize: 16, color: "#fff", fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
});
