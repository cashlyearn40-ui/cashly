import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Switch,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useLanguage } from "@/context/LanguageContext";
import { CURRENCY_META } from "@/lib/currency";
import {
  getUserSettings,
  saveUserSettings,
  UserSettings,
} from "@/lib/settings";
import Colors from "@/constants/colors";

const APP_VERSION = "1.0.4 (Beta)";

const EMOJI_CHOICES = [
  "😊", "😎", "🤑", "🚀", "💰", "🎯", "🏆", "🌟",
  "💪", "🦁", "🐯", "🦊", "🐸", "🦄", "🎮", "🎵",
  "🎨", "🏄", "⚡", "🔥", "💎", "🌈", "🤩", "👑",
];

const T = {
  es: {
    settings: "Configuración",
    accountSection: "Perfil y Cuenta",
    walletSection: "Pagos y Billetera",
    prefsSection: "Preferencias",
    supportSection: "Soporte y Seguridad",
    verified: "Cuenta Verificada",
    userId: "ID de Usuario",
    copy: "Copiar",
    copied: "¡Copiado!",
    editProfile: "Editar Perfil",
    paymentMethods: "Métodos de Pago",
    withdrawHistory: "Historial de Retiros",
    notifications: "Notificaciones",
    notificationsSub: "Bonos y videos nuevos",
    dataSaver: "Ahorro de Datos",
    dataSaverSub: "Optimiza el consumo de internet",
    language: "Idioma",
    helpFaq: "Ayuda y Preguntas Frecuentes",
    techSupport: "Soporte Técnico",
    changePassword: "Cambiar Contraseña",
    privacy: "Política de Privacidad",
    terms: "Términos de Uso",
    version: "Versión",
    signOut: "Cerrar Sesión",
    signOutConfirm: "¿Seguro que quieres cerrar sesión?",
    cancel: "Cancelar",
    save: "Guardar",
    username: "Nombre de Usuario",
    avatar: "Avatar",
    chooseAvatar: "Elige tu avatar",
    currentPassword: "Contraseña Actual",
    newPassword: "Contraseña Nueva",
    confirmPassword: "Confirmar Contraseña",
    update: "Actualizar",
    spanish: "Español",
    english: "Inglés",
    selectLanguage: "Selecciona el idioma",
    add: "Agregar",
    paymentMethodsBody: "Vincula tarjetas de regalo y otros sistemas de cobro próximamente.",
    helpFaqBody: "¿Cómo funciona Cashly Earn? Completa tareas y misiones para acumular saldo. El administrador revisa y aprueba las recompensas manualmente. Para retirar necesitas un saldo mínimo de $25 vía transferencia bancaria (CLABE).",
    techSupportBody: "Escríbenos a soporte@cashlyearn.com o usa el chat dentro de la app. Respondemos en menos de 24 horas.",
    privacyBody: "Tu privacidad es importante. Solo recopilamos los datos necesarios para procesar pagos y mejorar la experiencia. No vendemos tu información a terceros.",
    termsBody: "Al usar Cashly Earn aceptas: ganar dinero solo viendo videos completos, retiros mínimos de $25, y procesamiento de pagos en 3-5 días hábiles.",
    ok: "Entendido",
    success: "Éxito",
    error: "Error",
    passwordsNoMatch: "Las contraseñas no coinciden.",
    passwordTooShort: "La contraseña debe tener al menos 6 caracteres.",
    passwordChanged: "Contraseña actualizada correctamente.",
    profileSaved: "Perfil actualizado.",
    usernameRequired: "El nombre de usuario es requerido.",
  },
  en: {
    settings: "Settings",
    accountSection: "Profile & Account",
    walletSection: "Payments & Wallet",
    prefsSection: "Preferences",
    supportSection: "Support & Security",
    verified: "Verified Account",
    userId: "User ID",
    copy: "Copy",
    copied: "Copied!",
    editProfile: "Edit Profile",
    paymentMethods: "Payment Methods",
    withdrawHistory: "Withdrawal History",
    notifications: "Notifications",
    notificationsSub: "Bonus alerts and new videos",
    dataSaver: "Data Saver",
    dataSaverSub: "Optimize internet usage",
    language: "Language",
    helpFaq: "Help & FAQ",
    techSupport: "Tech Support",
    changePassword: "Change Password",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
    version: "Version",
    signOut: "Sign Out",
    signOutConfirm: "Are you sure you want to sign out?",
    cancel: "Cancel",
    save: "Save",
    username: "Username",
    avatar: "Avatar",
    chooseAvatar: "Choose your avatar",
    currentPassword: "Current Password",
    newPassword: "New Password",
    confirmPassword: "Confirm Password",
    update: "Update",
    spanish: "Spanish",
    english: "English",
    selectLanguage: "Select language",
    add: "Add",
    paymentMethodsBody: "Link gift cards and other payment systems coming soon.",
    helpFaqBody: "How does Cashly Earn work? Complete tasks and missions to accumulate balance. The administrator reviews and approves rewards manually. Minimum withdrawal is $25 via bank transfer (CLABE).",
    techSupportBody: "Email us at support@cashlyearn.com or use in-app chat. We reply within 24 hours.",
    privacyBody: "Your privacy matters. We only collect data needed to process payments and improve your experience. We never sell your information.",
    termsBody: "By using Cashly Earn you agree to: earning only from fully watched videos, $25 minimum withdrawal, and 3-5 business day payment processing.",
    ok: "Got it",
    success: "Success",
    error: "Error",
    passwordsNoMatch: "Passwords do not match.",
    passwordTooShort: "Password must be at least 6 characters.",
    passwordChanged: "Password updated successfully.",
    profileSaved: "Profile updated.",
    usernameRequired: "Username is required.",
  },
};

function shortUserId(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return `CSH-${h.toString().padStart(10, "0").slice(0, 10)}`;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser, logout, changePassword } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const { setLang } = useLanguage();
  const currencyMeta = CURRENCY_META[currency];
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState<null | { title: string; body: string }>(null);

  const [editEmoji, setEditEmoji] = useState("😊");
  const [editUsername, setEditUsername] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const lang = settings?.language ?? "es";
  const t = T[lang];

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      const s = await getUserSettings();
      if (!s.username) s.username = currentUser.email.split("@")[0];
      setSettings(s);
      setEditEmoji(s.emoji);
      setEditUsername(s.username);
      setLoading(false);
      if (s.language === "es" || s.language === "en") {
        setLang(s.language);
      }
    })();
  }, [currentUser]);

  const persist = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!currentUser || !settings) return;
      const updated: UserSettings = {
        ...settings,
        ...patch,
        notifications: { ...settings.notifications, ...(patch.notifications ?? {}) },
        payment: { ...settings.payment, ...(patch.payment ?? {}) },
      };
      setSettings(updated);
      await saveUserSettings(patch);
    },
    [currentUser, settings]
  );

  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };

  const handleCopyId = async () => {
    if (!currentUser) return;
    await Clipboard.setStringAsync(shortUserId(currentUser.email));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleSaveProfile = async () => {
    if (!editUsername.trim()) {
      Alert.alert(t.error, t.usernameRequired);
      return;
    }
    await persist({ emoji: editEmoji, username: editUsername.trim() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setProfileOpen(false);
    Alert.alert(t.success, t.profileSaved);
  };

  const handleChangePassword = async () => {
    if (pwNew.length < 6) {
      Alert.alert(t.error, t.passwordTooShort);
      return;
    }
    if (pwNew !== pwConfirm) {
      Alert.alert(t.error, t.passwordsNoMatch);
      return;
    }
    try {
      setPwBusy(true);
      await changePassword(pwCurrent, pwNew);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPasswordOpen(false);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      Alert.alert(t.success, t.passwordChanged);
    } catch (e: any) {
      Alert.alert(t.error, e?.message ?? "Error");
    } finally {
      setPwBusy(false);
    }
  };

  const handleLanguageSelect = async (next: "es" | "en") => {
    await persist({ language: next });
    setLang(next);
    Haptics.selectionAsync();
    setLanguageOpen(false);
  };

  const handleCurrencySelect = async (next: "USD" | "MXN") => {
    await setCurrency(next);
    Haptics.selectionAsync();
    setCurrencyOpen(false);
  };

  const performSignOut = async () => {
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      await logout();
      router.replace("/(auth)/login");
    } catch (e) {
      if (Platform.OS === "web") {
        window.alert("No se pudo cerrar la sesión. Intenta de nuevo.");
      } else {
        Alert.alert("Error", "No se pudo cerrar la sesión. Intenta de nuevo.");
      }
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === "web") {
      const ok = window.confirm(t.signOutConfirm);
      if (ok) performSignOut();
      return;
    }
    Alert.alert(t.signOut, t.signOutConfirm, [
      { text: t.cancel, style: "cancel" },
      { text: t.signOut, style: "destructive", onPress: performSignOut },
    ]);
  };

  if (loading || !settings || !currentUser) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <LinearGradient colors={["#060f1e", "#0a1628", "#0d2010"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={Colors.green.primary} />
      </View>
    );
  }

  const userId = shortUserId(currentUser.email);

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#060f1e", "#0a1628", "#0d2010"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable onPress={handleBack} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t.settings}</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.profileEmojiWrap}>
            <Text style={styles.profileEmoji}>{settings.emoji}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{settings.username || currentUser.email.split("@")[0]}</Text>
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.green.primary} />
              <Text style={styles.verifiedText}>{t.verified}</Text>
            </View>
            <View style={styles.idRow}>
              <Text style={styles.idLabel}>{t.userId}: </Text>
              <Text style={styles.idValue}>{userId}</Text>
              <Pressable style={styles.copyBtn} onPress={handleCopyId} hitSlop={8}>
                <Feather name={copied ? "check" : "copy"} size={12} color={copied ? Colors.green.primary : "rgba(255,255,255,0.7)"} />
                <Text style={[styles.copyText, copied && { color: Colors.green.primary }]}>{copied ? t.copied : t.copy}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Section 1 */}
        <SectionTitle text={t.accountSection} />
        <SettingGroup>
          <Row icon="person-outline" label={t.editProfile} onPress={() => setProfileOpen(true)} />
        </SettingGroup>

        {/* Section 2 */}
        <SectionTitle text={t.walletSection} />
        <SettingGroup>
          <Row icon="card-outline" label={t.paymentMethods} onPress={() => setInfoOpen({ title: t.paymentMethods, body: t.paymentMethodsBody })} />
          <Row icon="time-outline" label={t.withdrawHistory} onPress={() => router.push("/history")} isLast />
        </SettingGroup>

        {/* Section 3 */}
        <SectionTitle text={t.prefsSection} />
        <SettingGroup>
          <ToggleRow
            icon="notifications-outline"
            label={t.notifications}
            sub={t.notificationsSub}
            value={settings.notifications.newVideos && settings.notifications.bonusAlerts}
            onChange={(v) =>
              persist({
                notifications: { newVideos: v, bonusAlerts: v, paymentUpdates: v },
              })
            }
          />
          <ToggleRow
            icon="cellular-outline"
            label={t.dataSaver}
            sub={t.dataSaverSub}
            value={settings.dataSaver}
            onChange={(v) => persist({ dataSaver: v })}
          />
          <Row
            icon="globe-outline"
            label={t.language}
            value={settings.language === "es" ? t.spanish : t.english}
            onPress={() => setLanguageOpen(true)}
          />
          <Row
            icon="cash-outline"
            label={lang === "es" ? "Moneda" : "Currency"}
            value={`${currencyMeta.flag} ${currency}`}
            onPress={() => setCurrencyOpen(true)}
            isLast
          />
        </SettingGroup>

        {/* Section 4 */}
        <SectionTitle text={t.supportSection} />
        <SettingGroup>
          <Row icon="help-circle-outline" label={t.helpFaq} onPress={() => setInfoOpen({ title: t.helpFaq, body: t.helpFaqBody })} />
          <Row icon="chatbubbles-outline" label={t.techSupport} onPress={() => setInfoOpen({ title: t.techSupport, body: t.techSupportBody })} />
          <Row icon="lock-closed-outline" label={t.changePassword} onPress={() => setPasswordOpen(true)} />
          <Row icon="shield-outline" label={t.privacy} onPress={() => setInfoOpen({ title: t.privacy, body: t.privacyBody })} />
          <Row icon="document-text-outline" label={t.terms} onPress={() => setInfoOpen({ title: t.terms, body: t.termsBody })} isLast />
        </SettingGroup>

        {/* Version + sign out */}
        <Text style={styles.versionText}>
          {t.version} {APP_VERSION}
        </Text>
        <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.signOutText}>{t.signOut}</Text>
        </Pressable>
      </ScrollView>

      {/* Edit Profile Modal */}
      <ModalSheet visible={profileOpen} onClose={() => setProfileOpen(false)} title={t.editProfile}>
        <Text style={styles.modalLabel}>{t.chooseAvatar}</Text>
        <View style={styles.emojiGrid}>
          {EMOJI_CHOICES.map((e) => {
            const selected = e === editEmoji;
            return (
              <Pressable
                key={e}
                onPress={() => {
                  Haptics.selectionAsync();
                  setEditEmoji(e);
                }}
                style={[styles.emojiCell, selected && styles.emojiCellSelected]}
              >
                <Text style={styles.emojiCellText}>{e}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.modalLabel, { marginTop: 18 }]}>{t.username}</Text>
        <TextInput
          value={editUsername}
          onChangeText={setEditUsername}
          style={styles.modalInput}
          placeholder="reimercorny33"
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoCapitalize="none"
          maxLength={24}
        />
        <PrimaryBtn label={t.save} onPress={handleSaveProfile} />
      </ModalSheet>

      {/* Change Password Modal */}
      <ModalSheet visible={passwordOpen} onClose={() => setPasswordOpen(false)} title={t.changePassword}>
        <Text style={styles.modalLabel}>{t.currentPassword}</Text>
        <TextInput value={pwCurrent} onChangeText={setPwCurrent} style={styles.modalInput} secureTextEntry placeholderTextColor="rgba(255,255,255,0.3)" />
        <Text style={[styles.modalLabel, { marginTop: 12 }]}>{t.newPassword}</Text>
        <TextInput value={pwNew} onChangeText={setPwNew} style={styles.modalInput} secureTextEntry placeholderTextColor="rgba(255,255,255,0.3)" />
        <Text style={[styles.modalLabel, { marginTop: 12 }]}>{t.confirmPassword}</Text>
        <TextInput value={pwConfirm} onChangeText={setPwConfirm} style={styles.modalInput} secureTextEntry placeholderTextColor="rgba(255,255,255,0.3)" />
        <PrimaryBtn label={t.update} onPress={handleChangePassword} loading={pwBusy} />
      </ModalSheet>

      {/* Language Modal */}
      <ModalSheet visible={languageOpen} onClose={() => setLanguageOpen(false)} title={t.selectLanguage}>
        <LangChoice label={t.spanish} flag="🇪🇸" selected={settings.language === "es"} onPress={() => handleLanguageSelect("es")} />
        <LangChoice label={t.english} flag="🇺🇸" selected={settings.language === "en"} onPress={() => handleLanguageSelect("en")} />
      </ModalSheet>

      {/* Currency Modal */}
      <ModalSheet
        visible={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        title={lang === "es" ? "Selecciona tu moneda" : "Select your currency"}
      >
        <LangChoice
          label={lang === "es" ? "Dólar estadounidense" : "US Dollar"}
          flag="🇺🇸"
          selected={currency === "USD"}
          onPress={() => handleCurrencySelect("USD")}
        />
        <LangChoice
          label={lang === "es" ? "Peso mexicano" : "Mexican Peso"}
          flag="🇲🇽"
          selected={currency === "MXN"}
          onPress={() => handleCurrencySelect("MXN")}
        />
        <Text
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            fontFamily: "Inter_400Regular",
            textAlign: "center",
            marginTop: 14,
          }}
        >
          {lang === "es"
            ? "Toda la app reflejará la moneda elegida."
            : "The whole app will reflect your chosen currency."}
        </Text>
      </ModalSheet>

      {/* Info Modal */}
      <ModalSheet visible={infoOpen !== null} onClose={() => setInfoOpen(null)} title={infoOpen?.title ?? ""}>
        <Text style={styles.infoBody}>{infoOpen?.body}</Text>
        <PrimaryBtn label={t.ok} onPress={() => setInfoOpen(null)} />
      </ModalSheet>
    </View>
  );
}

function SectionTitle({ text }: { text: string }) {
  return <Text style={styles.sectionTitle}>{text.toUpperCase()}</Text>;
}

function SettingGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Row({
  icon,
  label,
  value,
  onPress,
  isLast,
}: {
  icon: any;
  label: string;
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => [styles.row, !isLast && styles.rowBorder, pressed && { backgroundColor: "rgba(255,255,255,0.03)" }]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={Colors.green.primary} />
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  sub,
  value,
  onChange,
}: {
  icon: any;
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={[styles.row, styles.rowBorder]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={Colors.green.primary} />
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          Haptics.selectionAsync();
          onChange(v);
        }}
        trackColor={{ false: "rgba(255,255,255,0.1)", true: Colors.green.dark }}
        thumbColor={value ? Colors.green.primary : "#f0f0f0"}
        ios_backgroundColor="rgba(255,255,255,0.1)"
      />
    </View>
  );
}

function ModalSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PrimaryBtn({ label, onPress, loading }: { label: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}>
      <LinearGradient colors={[Colors.green.dark, Colors.green.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGrad}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{label}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

function LangChoice({ label, flag, selected, onPress }: { label: string; flag: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.langRow, selected && styles.langRowSelected]}>
      <Text style={styles.langFlag}>{flag}</Text>
      <Text style={styles.langLabel}>{label}</Text>
      {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.green.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#060f1e" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, color: "#fff", fontFamily: "Inter_600SemiBold", letterSpacing: -0.2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.navy.card,
    borderWidth: 1,
    borderColor: Colors.navy.border,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  profileEmojiWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(46,204,90,0.15)",
    borderWidth: 2, borderColor: Colors.green.primary,
    alignItems: "center", justifyContent: "center",
  },
  profileEmoji: { fontSize: 32 },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 17, color: "#fff", fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedText: { fontSize: 12, color: Colors.green.primary, fontFamily: "Inter_500Medium" },
  idRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  idLabel: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" },
  idValue: { fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "Inter_500Medium" },
  copyBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 4,
  },
  copyText: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_500Medium" },

  sectionTitle: {
    fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "Inter_600SemiBold",
    letterSpacing: 1, marginBottom: 8, marginLeft: 4,
  },
  group: {
    backgroundColor: Colors.navy.card,
    borderWidth: 1, borderColor: Colors.navy.border,
    borderRadius: 16, marginBottom: 22, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: "rgba(46,204,90,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  rowMain: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14, color: "#fff", fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "Inter_400Regular" },
  rowValue: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "Inter_500Medium", maxWidth: 130 },

  versionText: {
    fontSize: 11, color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 12, marginTop: 6,
  },
  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#dc2626", paddingVertical: 16, borderRadius: 14,
  },
  signOutText: { fontSize: 15, color: "#fff", fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#0a1628",
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 22, paddingBottom: 36, maxHeight: "85%",
    borderWidth: 1, borderBottomWidth: 0, borderColor: Colors.navy.border,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  modalTitle: { fontSize: 17, color: "#fff", fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  modalLabel: { fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_500Medium", marginBottom: 8, letterSpacing: 0.3 },
  modalInput: {
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: Colors.navy.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: "#fff", fontFamily: "Inter_500Medium",
  },

  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emojiCell: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "transparent",
    alignItems: "center", justifyContent: "center",
  },
  emojiCellSelected: { borderColor: Colors.green.primary, backgroundColor: "rgba(46,204,90,0.15)" },
  emojiCellText: { fontSize: 24 },

  primaryBtn: { marginTop: 20, borderRadius: 14, overflow: "hidden" },
  primaryBtnGrad: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { fontSize: 15, color: "#fff", fontFamily: "Inter_600SemiBold" },

  langRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12, marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "transparent",
  },
  langRowSelected: { borderColor: Colors.green.primary, backgroundColor: "rgba(46,204,90,0.1)" },
  langFlag: { fontSize: 22 },
  langLabel: { flex: 1, fontSize: 14, color: "#fff", fontFamily: "Inter_500Medium" },

  infoBody: { fontSize: 14, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular", lineHeight: 22 },
});
