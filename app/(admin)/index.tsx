import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Clipboard,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";

// ─── Module-level token store — set by AdminPanel on mount ───────────────────
// The token is issued by the server on admin login and stored in AuthContext.
// No secret is ever hardcoded in the frontend bundle.
let _adminToken = "";

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function adminFetch(route: string): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const res = await fetch(url.toString(), {
    headers: { "x-admin-token": _adminToken },
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res;
}

async function adminRequest(method: string, route: string, data?: unknown): Promise<Response> {
  return apiRequest(method, route, data, { "x-admin-token": _adminToken });
}

// ─── Types ───────────────────────────────────────────────────────────────────
type UserRow = {
  email: string;
  createdAt: number;
  password: string;
  balance: number;
  lifetime: number;
  username: string;
};

type AdminWithdrawal = {
  id: string;
  type?: string;
  amount: number;
  method: string;
  detail: string;
  status: string;
  timestamp: number;
  processedAt?: number | null;
  userEmail: string;
  username: string;
};

type AdminData = {
  users: UserRow[];
  pending: AdminWithdrawal[];
  totalUsers: number;
  totalPaidOut: number;
  totalLifetime: number;
  totalPendingAmount: number;
};

type UserHistory = {
  earnings: { id: string; description: string; amount: number; timestamp: number }[];
  withdrawals: { id: string; amount: number; method: string; status: string; timestamp: number }[];
};

type UserSettings = {
  emoji: string;
  username: string;
  language: string;
  currency: string;
  payment: { method: string; paypalEmail: string; bankAccount: string };
};

type Tab = "dashboard" | "withdrawals" | "users" | "active";

type ActiveUser = {
  email: string;
  username: string;
  connectedAt: number;
};

type ParsedDetail = {
  accountNumber: string;
  accountType: string;
  bank: string;
  name?: string;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function parseWithdrawDetail(detail: string): ParsedDetail {
  try {
    const d = JSON.parse(detail);
    return {
      accountNumber: d.accountNumber ?? d.clabe ?? detail,
      accountType: d.accountType ?? (d.clabe ? "CLABE" : ""),
      bank: d.bank ?? d.bankName ?? "",
      name: d.name ?? d.beneficiaryName ?? "",
    };
  } catch {
    return { accountNumber: detail, accountType: "", bank: "" };
  }
}

function copyToClipboard(text: string, label: string) {
  Clipboard.setString(text);
  if (Platform.OS === "web") {
    window.alert(`Copiado: ${label}`);
  } else {
    Alert.alert("Copiado", `${label} copiado al portapapeles.`);
  }
}

function getUserLevel(lifetime: number): { label: string; color: string; icon: string } {
  if (lifetime >= 100) return { label: "Diamante", color: "#60a5fa", icon: "diamond" };
  if (lifetime >= 20)  return { label: "Oro",       color: "#f59e0b", icon: "trophy"  };
  if (lifetime >= 5)   return { label: "Plata",     color: "#9ca3af", icon: "medal"   };
  return                      { label: "Bronce",    color: "#cd7f32", icon: "ribbon"  };
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminPanel() {
  const insets = useSafeAreaInsets();
  const { logout, isAdmin, adminToken, changeAdminPin } = useAuth();

  // Sync server-issued session token into the module-level helper so adminFetch/adminRequest work
  useEffect(() => {
    if (adminToken) _adminToken = adminToken;
  }, [adminToken]);

  // Change-PIN modal state
  const [changePinOpen, setChangePinOpen] = useState(false);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("dashboard");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Broadcast state
  const [broadcastOpen, setBroadcastOpen]       = useState(false);
  const [broadcastTitle, setBroadcastTitle]     = useState("");
  const [broadcastBody, setBroadcastBody]       = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastConfirm, setBroadcastConfirm] = useState(false); // confirmation step

  // User detail modal
  const [selectedUser, setSelectedUser]     = useState<UserRow | null>(null);
  const [userDetailOpen, setUserDetailOpen] = useState(false);

  const topPadding    = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  // ─── Guard: non-admin should never reach here (AuthGuard handles it,
  //     but add a hard check as a second layer) ────────────────────────
  useEffect(() => {
    if (!isAdmin) router.replace("/(auth)/login");
  }, [isAdmin]);

  // ─── SSE real-time subscription ───────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || !adminToken) return;
    const url = `${getApiUrl()}/api/admin/stream?token=${encodeURIComponent(adminToken)}`;
    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
      es.onmessage = () => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals/all"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/active-users"] });
      };
    } catch {}
    return () => { try { es?.close(); } catch {} };
  }, [adminToken]);

  // ─── Queries ──────────────────────────────────────────────────────────
  const { data, isLoading, isRefetching, refetch } = useQuery<AdminData>({
    queryKey: ["/api/admin/data"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/data");
      return res.json();
    },
    refetchInterval: 30000,  // SSE handles real-time; polling is just a fallback
    staleTime: 10000,
  });

  const { data: activeUsers = [] } = useQuery<ActiveUser[]>({
    queryKey: ["/api/admin/active-users"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/active-users");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 5000,
  });

  // ─── Actions ──────────────────────────────────────────────────────────
  const handleApprove = async (w: AdminWithdrawal) => {
    const doit = async () => {
      try {
        setBusyId(w.id);
        await adminRequest("POST", `/api/admin/withdrawals/${w.id}/approve`, {
          userEmail: w.userEmail,
          amount: w.amount,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals/all"] });
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "No se pudo aprobar.");
      } finally {
        setBusyId(null);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`¿Aprobar retiro de $${w.amount.toFixed(2)} a ${w.username}?`)) doit();
      return;
    }
    Alert.alert(
      "Aprobar retiro",
      `¿Marcar como pagado el retiro de $${w.amount.toFixed(2)} a ${w.username}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "✅ Aprobar", onPress: doit },
      ]
    );
  };

  const handleReject = async (w: AdminWithdrawal) => {
    const doit = async () => {
      try {
        setBusyId(w.id);
        await adminRequest("POST", `/api/admin/withdrawals/${w.id}/reject`, {
          userEmail: w.userEmail,
          amount: w.amount,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals/all"] });
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "No se pudo rechazar.");
      } finally {
        setBusyId(null);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`¿Rechazar retiro de $${w.amount.toFixed(2)} a ${w.username}?`)) doit();
      return;
    }
    Alert.alert(
      "Rechazar retiro",
      `¿Rechazar y devolver $${w.amount.toFixed(2)} al saldo de ${w.username}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "❌ Rechazar", style: "destructive", onPress: doit },
      ]
    );
  };

  const handleBroadcastSend = async () => {
    try {
      setBroadcastSending(true);
      const res  = await adminRequest("POST", "/api/admin/broadcast", {
        title: broadcastTitle.trim(),
        body:  broadcastBody.trim(),
      });
      const json = await res.json();
      const sent = json.sent ?? 0;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBroadcastOpen(false);
      setBroadcastConfirm(false);
      setBroadcastTitle("");
      setBroadcastBody("");
      setTimeout(() => {
        if (Platform.OS === "web") {
          window.alert(`Notificación enviada a ${sent} usuario(s).`);
        } else {
          Alert.alert("Enviado ✅", `Notificación entregada a ${sent} usuario${sent !== 1 ? "s" : ""}.`);
        }
      }, 200);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo enviar.");
    } finally {
      setBroadcastSending(false);
    }
  };

  const performLogout = async () => {
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await logout();
      router.replace("/(auth)/login");
    } catch {
      Alert.alert("Error", "No se pudo cerrar la sesión.");
    }
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      if (window.confirm("¿Salir del panel de administrador?")) performLogout();
      return;
    }
    Alert.alert("Cerrar sesión", "¿Salir del panel de administrador?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: performLogout },
    ]);
  };

  const openUserDetail = (u: UserRow) => {
    setSelectedUser(u);
    setUserDetailOpen(true);
  };

  // ─── Loading ──────────────────────────────────────────────────────────
  if (isLoading || !data) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center" }]}>
        <LinearGradient colors={["#060f1e", "#0a1628", "#0d2010"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={Colors.green.primary} size="large" />
      </View>
    );
  }

  const pendingCount = data.pending.length;

  return (
    <View style={s.root}>
      <LinearGradient colors={["#060f1e", "#0a1628", "#0d2010"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: topPadding + 8 }]}>
        <View style={s.headerLeft}>
          <View style={s.adminLogo}>
            <Ionicons name="shield-checkmark" size={18} color="#fff" />
          </View>
          <View>
            <View style={s.adminBadgeRow}>
              <Text style={s.adminTitle}>Cashly Earn</Text>
              <View style={s.adminBadge}>
                <Text style={s.adminBadgeText}>ADMIN</Text>
              </View>
            </View>
            <View style={s.liveBadgeRow}>
              <View style={s.liveDot} />
              <Text style={s.adminSubtitle}>Panel en vivo · tiempo real</Text>
            </View>
          </View>
        </View>
        <Pressable style={s.logoutBtn} onPress={handleLogout} hitSlop={10}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        {(
          [
            { key: "dashboard",   label: "Resumen",  icon: "stats-chart" },
            { key: "withdrawals", label: `Retiros${pendingCount > 0 ? ` (${pendingCount})` : ""}`, icon: "wallet" },
            { key: "users",       label: "Usuarios", icon: "people" },
            { key: "active",      label: `Activos${activeUsers.length > 0 ? ` (${activeUsers.length})` : ""}`, icon: "pulse" },
          ] as const
        ).map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              style={[s.tabBtn, active && s.tabBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setTab(t.key as Tab); }}
            >
              <Ionicons name={t.icon as any} size={14} color={active ? Colors.green.primary : "rgba(255,255,255,0.5)"} />
              <Text style={[s.tabBtnText, active && s.tabBtnTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Content ────────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomPadding + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={Colors.green.primary} />}
      >
        {tab === "dashboard" && (
          <DashboardTab
            data={data}
            onOpenBroadcast={() => { setBroadcastConfirm(false); setBroadcastOpen(true); }}
            onOpenChangePin={() => setChangePinOpen(true)}
          />
        )}
        {tab === "withdrawals" && (
          <WithdrawalsTab data={data} onApprove={handleApprove} onReject={handleReject} busyId={busyId} />
        )}
        {tab === "users" && (
          <UsersTab data={data} onSelectUser={openUserDetail} />
        )}
        {tab === "active" && (
          <ActiveUsersTab users={activeUsers} />
        )}
      </ScrollView>

      {/* ── Broadcast modal ─────────────────────────────────────────── */}
      <Modal visible={broadcastOpen} animationType="slide" transparent onRequestClose={() => { setBroadcastOpen(false); setBroadcastConfirm(false); }}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            {/* Header */}
            <View style={s.modalHeader}>
              <View style={s.modalIconWrap}>
                <Ionicons name="megaphone" size={20} color={Colors.green.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>
                  {broadcastConfirm ? "Confirmar envío" : "Notificación masiva"}
                </Text>
                <Text style={s.modalSubtitle}>
                  Se enviará a {data.totalUsers} usuario{data.totalUsers !== 1 ? "s" : ""}
                </Text>
              </View>
              <Pressable onPress={() => { setBroadcastOpen(false); setBroadcastConfirm(false); }} hitSlop={10} style={s.modalCloseBtn}>
                <Ionicons name="close" size={18} color="#fff" />
              </Pressable>
            </View>

            {/* Compose step */}
            {!broadcastConfirm && (
              <View style={{ gap: 12, marginTop: 16 }}>
                <View>
                  <Text style={s.fieldLabel}>Título</Text>
                  <TextInput
                    style={s.field}
                    value={broadcastTitle}
                    onChangeText={setBroadcastTitle}
                    placeholder="Ej. ¡Hoy pagamos doble!"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    selectionColor={Colors.green.primary}
                    maxLength={60}
                  />
                </View>
                <View>
                  <Text style={s.fieldLabel}>Mensaje</Text>
                  <TextInput
                    style={[s.field, s.fieldMultiline]}
                    value={broadcastBody}
                    onChangeText={setBroadcastBody}
                    placeholder="Escribe el contenido de la notificación..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    selectionColor={Colors.green.primary}
                    multiline
                    numberOfLines={4}
                    maxLength={250}
                  />
                  <Text style={s.charCount}>{broadcastBody.length}/250</Text>
                </View>

                <Pressable
                  style={[s.sendBtn, (!broadcastTitle.trim() || !broadcastBody.trim()) && { opacity: 0.5 }]}
                  disabled={!broadcastTitle.trim() || !broadcastBody.trim()}
                  onPress={() => setBroadcastConfirm(true)}
                >
                  <Ionicons name="eye" size={16} color="#fff" />
                  <Text style={s.sendBtnText}>Revisar antes de enviar</Text>
                </Pressable>
              </View>
            )}

            {/* Confirmation step */}
            {broadcastConfirm && (
              <View style={{ gap: 14, marginTop: 16 }}>
                <View style={s.confirmWarning}>
                  <Ionicons name="warning" size={20} color="#f59e0b" />
                  <Text style={s.confirmWarningText}>
                    ¿Seguro que quieres enviar este mensaje a todos los usuarios?
                  </Text>
                </View>

                {/* Preview */}
                <View style={s.confirmPreview}>
                  <Text style={s.confirmPreviewLabel}>TÍTULO</Text>
                  <Text style={s.confirmPreviewTitle}>{broadcastTitle}</Text>
                  <View style={s.confirmDivider} />
                  <Text style={s.confirmPreviewLabel}>MENSAJE</Text>
                  <Text style={s.confirmPreviewBody}>{broadcastBody}</Text>
                </View>

                <View style={s.confirmRecipients}>
                  <Ionicons name="people" size={14} color={Colors.green.primary} />
                  <Text style={s.confirmRecipientsText}>
                    {data.totalUsers} destinatario{data.totalUsers !== 1 ? "s" : ""}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable style={[s.sendBtn, { flex: 1, backgroundColor: "rgba(255,255,255,0.08)" }]} onPress={() => setBroadcastConfirm(false)}>
                    <Ionicons name="arrow-back" size={16} color="#fff" />
                    <Text style={s.sendBtnText}>Editar</Text>
                  </Pressable>
                  <Pressable
                    style={[s.sendBtn, { flex: 1 }, broadcastSending && { opacity: 0.6 }]}
                    disabled={broadcastSending}
                    onPress={handleBroadcastSend}
                  >
                    {broadcastSending
                      ? <ActivityIndicator size="small" color="#fff" />
                      : (<><Ionicons name="send" size={16} color="#fff" /><Text style={s.sendBtnText}>Enviar</Text></>)
                    }
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── User detail modal ──────────────────────────────────────── */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          visible={userDetailOpen}
          onClose={() => { setUserDetailOpen(false); setSelectedUser(null); }}
        />
      )}

      {/* ── Change PIN modal ────────────────────────────────────────── */}
      <ChangePinModal
        visible={changePinOpen}
        onClose={() => setChangePinOpen(false)}
        changeAdminPin={changeAdminPin}
      />
    </View>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({
  data,
  onOpenBroadcast,
  onOpenChangePin,
}: {
  data: AdminData;
  onOpenBroadcast: () => void;
  onOpenChangePin: () => void;
}) {
  const totalBalance = data.users.reduce((s, u) => s + u.balance, 0);

  return (
    <View>
      <View style={s.statGrid}>
        <StatCard icon="people"     label="Usuarios Registrados"  value={data.totalUsers.toString()}                   tone="primary" />
        <StatCard icon="cash"       label="Pagado a Usuarios"     value={`$${data.totalPaidOut.toFixed(2)}`}           tone="green"  />
      </View>
      <View style={s.statGrid}>
        <StatCard icon="time"       label="Solicitudes Pendientes" value={data.pending.length.toString()}             tone={data.pending.length > 0 ? "amber" : "muted"} />
        <StatCard icon="trending-up" label="Ganancias Totales"    value={`$${data.totalLifetime.toFixed(2)}`}         tone="primary" />
      </View>

      <Text style={s.sectionTitle}>RESUMEN FINANCIERO</Text>
      <View style={s.summaryCard}>
        <SummaryRow label="Pagos completados"      value={`$${data.totalPaidOut.toFixed(2)}`}       icon="checkmark-circle" iconColor={Colors.green.primary} />
        <SummaryRow label="Por pagar (pendiente)"  value={`$${data.totalPendingAmount.toFixed(2)}`} icon="hourglass"        iconColor="#f59e0b" />
        <SummaryRow label="Saldo total en cuentas" value={`$${totalBalance.toFixed(2)}`}            icon="wallet"           iconColor="#60a5fa" />
        <SummaryRow label="Ganancias generadas"    value={`$${data.totalLifetime.toFixed(2)}`}      icon="trending-up"      iconColor={Colors.green.primary} isLast />
      </View>

      {data.pending.length > 0 && (
        <View style={s.alertBanner}>
          <Ionicons name="alert-circle" size={18} color="#f59e0b" />
          <Text style={s.alertText}>
            Tienes {data.pending.length} {data.pending.length === 1 ? "solicitud" : "solicitudes"} de retiro esperando aprobación.
          </Text>
        </View>
      )}

      <Text style={s.sectionTitle}>COMUNICACIÓN</Text>
      <Pressable style={s.broadcastCard} onPress={onOpenBroadcast}>
        <View style={s.broadcastIcon}>
          <Ionicons name="megaphone" size={20} color={Colors.green.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.broadcastTitle}>Enviar notificación a todos</Text>
          <Text style={s.broadcastSubtitle}>
            Mensaje masivo a {data.totalUsers} usuarios · máx. 250 caracteres
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
      </Pressable>

      <Text style={s.sectionTitle}>SEGURIDAD</Text>
      <Pressable style={s.broadcastCard} onPress={onOpenChangePin}>
        <View style={[s.broadcastIcon, { backgroundColor: "rgba(96,165,250,0.12)" }]}>
          <Ionicons name="keypad" size={20} color="#60a5fa" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.broadcastTitle}>Cambiar PIN de acceso</Text>
          <Text style={s.broadcastSubtitle}>Modifica el PIN de verificación de 4 dígitos</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
      </Pressable>
    </View>
  );
}

// ─── Withdrawals Tab ──────────────────────────────────────────────────────────
function WithdrawalsTab({
  data,
  onApprove,
  onReject,
  busyId,
}: {
  data: AdminData;
  onApprove: (w: AdminWithdrawal) => void;
  onReject: (w: AdminWithdrawal) => void;
  busyId: string | null;
}) {
  const [subTab, setSubTab] = useState<"pending" | "history">("pending");

  const { data: historyData, isLoading: histLoading, refetch: histRefetch, isRefetching: histRefetching } = useQuery<AdminWithdrawal[]>({
    queryKey: ["/api/admin/withdrawals/all"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/withdrawals/all");
      return res.json();
    },
    refetchInterval: 5000,
    staleTime: 3000,
  });

  return (
    <View style={{ gap: 12 }}>
      {/* Sub-tab toggle */}
      <View style={s.subTabBar}>
        <Pressable
          style={[s.subTabBtn, subTab === "pending" && s.subTabBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setSubTab("pending"); }}
        >
          <Text style={[s.subTabText, subTab === "pending" && s.subTabTextActive]}>
            Pendientes {data.pending.length > 0 ? `(${data.pending.length})` : ""}
          </Text>
        </Pressable>
        <Pressable
          style={[s.subTabBtn, subTab === "history" && s.subTabBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setSubTab("history"); histRefetch(); }}
        >
          <Text style={[s.subTabText, subTab === "history" && s.subTabTextActive]}>Historial</Text>
        </Pressable>
      </View>

      {/* ── Pendientes ── */}
      {subTab === "pending" && (
        <>
          {data.pending.length === 0 ? (
            <View style={s.emptyState}>
              <View style={s.emptyIcon}>
                <Ionicons name="checkmark-done-circle" size={48} color={Colors.green.primary} />
              </View>
              <Text style={s.emptyTitle}>Todo al día</Text>
              <Text style={s.emptyText}>No hay solicitudes de retiro pendientes.</Text>
            </View>
          ) : (
            <>
              <Text style={s.sectionTitle}>SOLICITUDES PENDIENTES ({data.pending.length})</Text>
              {data.pending.map((w) => (
                <WithdrawalCard
                  key={w.id}
                  w={w}
                  busy={busyId === w.id}
                  onApprove={() => onApprove(w)}
                  onReject={() => onReject(w)}
                  showActions
                />
              ))}
            </>
          )}
        </>
      )}

      {/* ── Historial ── */}
      {subTab === "history" && (
        <>
          {histLoading || histRefetching ? (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <ActivityIndicator color={Colors.green.primary} />
            </View>
          ) : !historyData || historyData.length === 0 ? (
            <View style={s.emptyState}>
              <View style={s.emptyIcon}>
                <Ionicons name="time-outline" size={48} color="rgba(255,255,255,0.3)" />
              </View>
              <Text style={s.emptyTitle}>Sin historial</Text>
              <Text style={s.emptyText}>No hay retiros procesados todavía.</Text>
            </View>
          ) : (
            <>
              <Text style={s.sectionTitle}>RETIROS PROCESADOS ({historyData.length})</Text>
              {historyData.map((w) => (
                <WithdrawalCard key={w.id} w={w} busy={false} showActions={false} />
              ))}
            </>
          )}
        </>
      )}
    </View>
  );
}

// ─── Withdrawal Card ──────────────────────────────────────────────────────────
function WithdrawalCard({
  w,
  busy,
  onApprove,
  onReject,
  showActions,
}: {
  w: AdminWithdrawal;
  busy: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  showActions: boolean;
}) {
  const { accountNumber, accountType, bank, name } = parseWithdrawDetail(w.detail);
  const isClabe    = accountType === "CLABE" || accountType === "bank";
  const typeLabel  = accountType === "CARD" ? "Tarjeta" : accountType || "CLABE";
  const statusMeta = getStatusMeta(w.status);

  return (
    <View style={[s.withdrawCard, !showActions && { borderColor: statusMeta.borderColor }]}>
      {/* Header: usuario + monto + status badge */}
      <View style={s.withdrawTop}>
        <View style={s.withdrawAvatar}>
          <Text style={s.withdrawAvatarText}>{w.username.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.withdrawUser}>{w.username}</Text>
          <Text style={s.withdrawEmail} numberOfLines={1}>{w.userEmail}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={s.withdrawAmount}>${w.amount.toFixed(2)}</Text>
          {!showActions && (
            <View style={[s.statusPill, { backgroundColor: statusMeta.bg }]}>
              <Text style={[s.statusPillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Beneficiario */}
      {name ? (
        <View style={s.beneficiaryRow}>
          <Ionicons name="person-outline" size={12} color="rgba(255,255,255,0.4)" />
          <Text style={s.beneficiaryText}>{name}</Text>
        </View>
      ) : null}

      {/* Datos bancarios */}
      <View style={s.bankDetailsBox}>
        <View style={s.bankDetailRow}>
          <View style={s.bankDetailPills}>
            {typeLabel ? (
              <View style={[s.metaPill, isClabe ? s.metaPillClabe : s.metaPillCard]}>
                <Ionicons name={isClabe ? "business-outline" : "card-outline"} size={11} color={isClabe ? Colors.green.primary : "#60a5fa"} />
                <Text style={[s.metaPillText, isClabe ? { color: Colors.green.primary } : { color: "#60a5fa" }]}>{typeLabel}</Text>
              </View>
            ) : null}
            {bank ? (
              <View style={s.metaPill}>
                <Text style={s.metaPillText}>{bank}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Pressable style={s.accountNumberRow} onPress={() => copyToClipboard(accountNumber, typeLabel || "Número de cuenta")} hitSlop={8}>
          <Text style={s.accountNumberFull} selectable numberOfLines={1}>{accountNumber}</Text>
          <View style={s.copyBtn}>
            <Ionicons name="copy-outline" size={13} color={Colors.green.primary} />
            <Text style={s.copyBtnText}>Copiar</Text>
          </View>
        </Pressable>
        <Text style={s.accountLengthHint}>
          {accountNumber.length} dígitos
          {accountNumber.length === 18 ? " · CLABE válida ✓" : accountNumber.length === 16 ? " · Tarjeta válida ✓" : ""}
        </Text>
      </View>

      {/* Fecha */}
      <View style={s.withdrawDate}>
        <Feather name="clock" size={11} color="rgba(255,255,255,0.4)" />
        <Text style={s.withdrawDateText}>
          Solicitado {fmtDate(w.timestamp)} · {fmtTime(w.timestamp)}
        </Text>
        {!showActions && w.processedAt ? (
          <>
            <Text style={s.withdrawDateText}>  ·  Procesado {fmtDate(w.processedAt)}</Text>
          </>
        ) : null}
      </View>

      {/* Acciones (solo en Pendientes) */}
      {showActions && (
        <View style={s.withdrawActions}>
          <Pressable style={[s.actionBtn, s.rejectBtn, busy && { opacity: 0.5 }]} onPress={onReject} disabled={busy}>
            <Ionicons name="close" size={16} color="#fff" />
            <Text style={s.actionBtnText}>Rechazar</Text>
          </Pressable>
          <Pressable style={[s.actionBtn, s.approveBtn, busy && { opacity: 0.5 }]} onPress={onApprove} disabled={busy}>
            {busy
              ? <ActivityIndicator size="small" color="#fff" />
              : (<><Ionicons name="checkmark" size={16} color="#fff" /><Text style={s.actionBtnText}>Marcar Pagado</Text></>)
            }
          </Pressable>
        </View>
      )}
    </View>
  );
}

function getStatusMeta(status: string): { label: string; color: string; bg: string; borderColor: string } {
  switch (status) {
    case "completed": return { label: "Completado", color: Colors.green.primary, bg: "rgba(46,204,90,0.12)", borderColor: "rgba(46,204,90,0.2)" };
    case "rejected":  return { label: "Rechazado",  color: "#f87171",            bg: "rgba(248,113,113,0.1)", borderColor: "rgba(248,113,113,0.2)" };
    case "expired":   return { label: "Expirado",   color: "#9ca3af",            bg: "rgba(156,163,175,0.1)", borderColor: "rgba(156,163,175,0.15)" };
    default:          return { label: "Pendiente",  color: "#f59e0b",            bg: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.2)" };
  }
}

// ─── Active Users Tab ─────────────────────────────────────────────────────────
function ActiveUsersTab({ users }: { users: ActiveUser[] }) {
  if (users.length === 0) {
    return (
      <View style={s.emptyState}>
        <View style={s.emptyIcon}>
          <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
        </View>
        <Text style={s.emptyTitle}>Nadie conectado</Text>
        <Text style={s.emptyText}>
          Aquí aparecerán los usuarios con la app abierta en este momento.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.sectionTitle}>USUARIOS ACTIVOS AHORA ({users.length})</Text>

      {/* Live indicator banner */}
      <View style={s.activeBanner}>
        <View style={s.activeDotLarge} />
        <Text style={s.activeBannerText}>Actualización en tiempo real · desaparece al cerrar la app</Text>
      </View>

      {users.map((u) => (
        <View key={u.email} style={s.activeCard}>
          <View style={s.activeAvatarWrap}>
            <View style={s.activeAvatarCircle}>
              <Text style={s.activeAvatarText}>{u.username.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={s.onlineDot} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.activeUsername}>{u.username}</Text>
            <Text style={s.activeEmail} numberOfLines={1}>{u.email}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            <View style={s.activePill}>
              <View style={s.activePillDot} />
              <Text style={s.activePillText}>En línea</Text>
            </View>
            <Text style={s.activeConnectedAt}>
              desde {fmtTime(u.connectedAt)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab({ data, onSelectUser }: { data: AdminData; onSelectUser: (u: UserRow) => void }) {
  if (data.users.length === 0) {
    return (
      <View style={s.emptyState}>
        <View style={s.emptyIcon}>
          <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.3)" />
        </View>
        <Text style={s.emptyTitle}>Sin usuarios</Text>
        <Text style={s.emptyText}>Todavía no se ha registrado ningún usuario.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.sectionTitle}>USUARIOS REGISTRADOS ({data.users.length})</Text>
      {data.users.map((u) => {
        const level = getUserLevel(u.lifetime);
        return (
          <Pressable key={u.email} style={s.userCard} onPress={() => onSelectUser(u)}>
            <View style={s.userAvatar}>
              <Text style={s.userAvatarText}>{u.username.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={s.userName}>{u.username}</Text>
                <View style={[s.levelBadge, { backgroundColor: level.color + "22" }]}>
                  <Text style={[s.levelBadgeText, { color: level.color }]}>{level.label}</Text>
                </View>
              </View>
              <Text style={s.userEmail} numberOfLines={1}>{u.email}</Text>
              <Text style={s.userJoined}>Registrado {fmtDate(u.createdAt)}</Text>
            </View>
            <View style={s.userStats}>
              <Text style={s.userBalance}>${u.balance.toFixed(2)}</Text>
              <Text style={s.userLifetime}>${u.lifetime.toFixed(2)} total</Text>
              <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.3)" style={{ marginTop: 2 }} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── User Detail Modal ────────────────────────────────────────────────────────
function UserDetailModal({ user, visible, onClose }: { user: UserRow; visible: boolean; onClose: () => void }) {
  const level = getUserLevel(user.lifetime);
  const MONTHLY_LIMIT = 50;

  const { data: history, isLoading: histLoading } = useQuery<UserHistory>({
    queryKey: [`/api/user/history/${user.email}`],
    queryFn: async () => {
      const res = await adminFetch(`/api/user/history/${encodeURIComponent(user.email)}`);
      return res.json();
    },
    enabled: visible,
    staleTime: 15000,
  });

  const { data: settings, isLoading: settLoading } = useQuery<UserSettings>({
    queryKey: [`/api/user/settings/${user.email}`],
    queryFn: async () => {
      const res = await adminFetch(`/api/user/settings/${encodeURIComponent(user.email)}`);
      return res.json();
    },
    enabled: visible,
    staleTime: 15000,
  });

  const totalEarnings   = history?.earnings.reduce((s, e) => s + e.amount, 0) ?? 0;
  const totalWithdrawn  = history?.withdrawals.filter(w => w.status === "completed").reduce((s, w) => s + w.amount, 0) ?? 0;
  const loading = histLoading || settLoading;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={[s.modalCard, { maxHeight: "90%" }]}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View style={[s.userAvatar, { width: 44, height: 44, borderRadius: 22 }]}>
              <Text style={[s.userAvatarText, { fontSize: 18 }]}>{user.username.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.modalTitle}>{user.username}</Text>
              <Text style={s.modalSubtitle} numberOfLines={1}>{user.email}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={s.modalCloseBtn}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 32 }}>
              <ActivityIndicator color={Colors.green.primary} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 16 }}>
              {/* Level & Account info */}
              <View style={s.detailSection}>
                <View style={s.detailRow}>
                  <View style={[s.summaryIcon, { backgroundColor: level.color + "22" }]}>
                    <Ionicons name={level.icon as any} size={14} color={level.color} />
                  </View>
                  <Text style={s.summaryLabel}>Nivel actual</Text>
                  <Text style={[s.summaryValue, { color: level.color }]}>{level.label}</Text>
                </View>
                <View style={s.detailRow}>
                  <View style={[s.summaryIcon, { backgroundColor: "rgba(96,165,250,0.15)" }]}>
                    <Ionicons name="calendar-outline" size={14} color="#60a5fa" />
                  </View>
                  <Text style={s.summaryLabel}>Límite mensual</Text>
                  <Text style={s.summaryValue}>${MONTHLY_LIMIT.toFixed(2)}</Text>
                </View>
                <View style={s.detailRow}>
                  <View style={[s.summaryIcon, { backgroundColor: "rgba(46,204,90,0.15)" }]}>
                    <Ionicons name="wallet-outline" size={14} color={Colors.green.primary} />
                  </View>
                  <Text style={s.summaryLabel}>Saldo disponible</Text>
                  <Text style={[s.summaryValue, { color: Colors.green.primary }]}>${user.balance.toFixed(2)}</Text>
                </View>
                <View style={s.detailRow}>
                  <View style={[s.summaryIcon, { backgroundColor: "rgba(46,204,90,0.15)" }]}>
                    <Ionicons name="trending-up" size={14} color={Colors.green.primary} />
                  </View>
                  <Text style={s.summaryLabel}>Ganado de por vida</Text>
                  <Text style={s.summaryValue}>${user.lifetime.toFixed(2)}</Text>
                </View>
                <View style={[s.detailRow, { borderBottomWidth: 0 }]}>
                  <View style={[s.summaryIcon, { backgroundColor: "rgba(248,113,113,0.12)" }]}>
                    <Ionicons name="arrow-up-circle-outline" size={14} color="#f87171" />
                  </View>
                  <Text style={s.summaryLabel}>Retirado (pagado)</Text>
                  <Text style={s.summaryValue}>${totalWithdrawn.toFixed(2)}</Text>
                </View>
              </View>

              {/* Payment method */}
              {settings?.payment?.method && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 16 }]}>MÉTODO DE PAGO</Text>
                  <View style={s.detailSection}>
                    <View style={s.detailRow}>
                      <View style={[s.summaryIcon, { backgroundColor: "rgba(96,165,250,0.15)" }]}>
                        <Ionicons name="card-outline" size={14} color="#60a5fa" />
                      </View>
                      <Text style={s.summaryLabel}>Método</Text>
                      <Text style={s.summaryValue}>{settings.payment.method || "—"}</Text>
                    </View>
                    {settings.payment.paypalEmail ? (
                      <View style={[s.detailRow, { borderBottomWidth: 0 }]}>
                        <View style={[s.summaryIcon, { backgroundColor: "rgba(96,165,250,0.15)" }]}>
                          <Ionicons name="mail-outline" size={14} color="#60a5fa" />
                        </View>
                        <Text style={s.summaryLabel}>PayPal</Text>
                        <Text style={s.summaryValue} numberOfLines={1}>{settings.payment.paypalEmail}</Text>
                      </View>
                    ) : null}
                    {settings.payment.bankAccount ? (
                      <Pressable style={[s.detailRow, { borderBottomWidth: 0 }]} onPress={() => copyToClipboard(settings!.payment.bankAccount, "Cuenta bancaria")}>
                        <View style={[s.summaryIcon, { backgroundColor: "rgba(46,204,90,0.15)" }]}>
                          <Ionicons name="business-outline" size={14} color={Colors.green.primary} />
                        </View>
                        <Text style={s.summaryLabel}>Cuenta bancaria</Text>
                        <Text style={[s.summaryValue, { fontSize: 12 }]} numberOfLines={1}>{settings.payment.bankAccount}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              )}

              {/* Earnings history */}
              <Text style={[s.sectionTitle, { marginTop: 16 }]}>
                HISTORIAL DE GANANCIAS ({history?.earnings.length ?? 0})
              </Text>
              {history?.earnings.length === 0 ? (
                <Text style={s.detailEmpty}>Sin ganancias registradas.</Text>
              ) : (
                <View style={s.detailSection}>
                  {(history?.earnings ?? []).slice(0, 20).map((e, i) => (
                    <View key={e.id} style={[s.detailRow, i === Math.min((history?.earnings.length ?? 1) - 1, 19) && { borderBottomWidth: 0 }]}>
                      <View style={[s.summaryIcon, { backgroundColor: "rgba(46,204,90,0.12)" }]}>
                        <Ionicons name="add-circle-outline" size={13} color={Colors.green.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.summaryLabel, { fontSize: 12 }]}>{e.description}</Text>
                        <Text style={[s.summaryLabel, { fontSize: 10, opacity: 0.6 }]}>{fmtDate(e.timestamp)}</Text>
                      </View>
                      <Text style={[s.summaryValue, { color: Colors.green.primary }]}>+${e.amount.toFixed(4)}</Text>
                    </View>
                  ))}
                  {(history?.earnings.length ?? 0) > 20 && (
                    <Text style={[s.detailEmpty, { paddingVertical: 8 }]}>
                      +{(history!.earnings.length - 20)} registros más
                    </Text>
                  )}
                </View>
              )}

              {/* Withdrawals history */}
              <Text style={[s.sectionTitle, { marginTop: 16 }]}>
                HISTORIAL DE RETIROS ({history?.withdrawals.length ?? 0})
              </Text>
              {history?.withdrawals.length === 0 ? (
                <Text style={s.detailEmpty}>Sin retiros registrados.</Text>
              ) : (
                <View style={[s.detailSection, { marginBottom: 20 }]}>
                  {(history?.withdrawals ?? []).map((w, i) => {
                    const meta = getStatusMeta(w.status);
                    return (
                      <View key={w.id} style={[s.detailRow, i === (history?.withdrawals.length ?? 1) - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[s.summaryIcon, { backgroundColor: meta.bg }]}>
                          <Ionicons name="arrow-up-circle-outline" size={13} color={meta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.summaryLabel, { fontSize: 12 }]}>{w.method}</Text>
                          <Text style={[s.summaryLabel, { fontSize: 10, opacity: 0.6 }]}>{fmtDate(w.timestamp)}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 2 }}>
                          <Text style={[s.summaryValue, { fontSize: 13 }]}>-${w.amount.toFixed(2)}</Text>
                          <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
                            <Text style={[s.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Change PIN Modal ─────────────────────────────────────────────────────────
function ChangePinModal({
  visible,
  onClose,
  changeAdminPin,
}: {
  visible: boolean;
  onClose: () => void;
  changeAdminPin: (currentPin: string, newPin: string) => Promise<void>;
}) {
  const [currentPin,     setCurrentPin]     = useState("");
  const [confirmCurrent, setConfirmCurrent] = useState("");
  const [newPin,         setNewPin]         = useState("");
  const [confirmNew,     setConfirmNew]     = useState("");
  const [error,          setError]          = useState("");
  const [success,        setSuccess]        = useState(false);
  const [loading,        setLoading]        = useState(false);

  const reset = () => {
    setCurrentPin(""); setConfirmCurrent("");
    setNewPin(""); setConfirmNew("");
    setError(""); setSuccess(false); setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const validate = (v: string) => /^\d{4}$/.test(v);

  const handleSubmit = async () => {
    setError("");
    if (!validate(currentPin) || !validate(confirmCurrent) || !validate(newPin) || !validate(confirmNew)) {
      setError("Todos los campos deben ser de 4 dígitos numéricos.");
      return;
    }
    if (currentPin !== confirmCurrent) {
      setError("La confirmación del PIN actual no coincide.");
      return;
    }
    if (newPin !== confirmNew) {
      setError("La confirmación del nuevo PIN no coincide.");
      return;
    }
    if (newPin === currentPin) {
      setError("El nuevo PIN debe ser diferente al actual.");
      return;
    }
    try {
      setLoading(true);
      await changeAdminPin(currentPin, newPin);
      setSuccess(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => { handleClose(); }, 1600);
    } catch (e: any) {
      let msg = "Error al cambiar el PIN.";
      try {
        const raw = e?.message ?? "";
        const idx = raw.indexOf("{");
        if (idx !== -1) { const p = JSON.parse(raw.slice(idx)); msg = p.message ?? msg; }
      } catch {}
      setError(msg);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const PinField = ({
    label, value, onChange,
  }: { label: string; value: string; onChange: (v: string) => void }) => (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.field}
        value={value}
        onChangeText={(t) => { onChange(t.replace(/\D/g, "").slice(0, 4)); setError(""); }}
        placeholder="••••"
        placeholderTextColor="rgba(255,255,255,0.2)"
        keyboardType="numeric"
        secureTextEntry
        maxLength={4}
        selectionColor={Colors.green.primary}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View style={[s.broadcastIcon, { backgroundColor: "rgba(96,165,250,0.12)", width: 38, height: 38, borderRadius: 10 }]}>
              <Ionicons name="keypad" size={18} color="#60a5fa" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Cambiar PIN</Text>
              <Text style={s.modalSubtitle}>PIN de verificación de 4 dígitos</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={10} style={s.modalCloseBtn}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>

          {success ? (
            <View style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(46,204,90,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark-circle" size={32} color={Colors.green.primary} />
              </View>
              <Text style={[s.broadcastTitle, { textAlign: "center" }]}>¡PIN actualizado!</Text>
              <Text style={[s.broadcastSubtitle, { textAlign: "center" }]}>Tu nuevo PIN de acceso está activo.</Text>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 16 }}>
              <View style={s.pinSectionDivider}>
                <Ionicons name="lock-closed-outline" size={12} color="rgba(255,255,255,0.35)" />
                <Text style={s.pinSectionLabel}>PIN ACTUAL</Text>
              </View>
              <PinField label="PIN actual" value={currentPin} onChange={setCurrentPin} />
              <PinField label="Confirmar PIN actual" value={confirmCurrent} onChange={setConfirmCurrent} />

              <View style={[s.pinSectionDivider, { marginTop: 4 }]}>
                <Ionicons name="key-outline" size={12} color="rgba(255,255,255,0.35)" />
                <Text style={s.pinSectionLabel}>NUEVO PIN</Text>
              </View>
              <PinField label="Nuevo PIN" value={newPin} onChange={setNewPin} />
              <PinField label="Confirmar nuevo PIN" value={confirmNew} onChange={setConfirmNew} />

              {!!error && (
                <View style={s.pinErrorRow}>
                  <Ionicons name="alert-circle-outline" size={14} color="#f87171" />
                  <Text style={s.pinErrorText}>{error}</Text>
                </View>
              )}

              <Pressable
                style={[
                  s.sendBtn,
                  { marginTop: 4 },
                  (loading || success) && { opacity: 0.6 },
                  (!currentPin || !confirmCurrent || !newPin || !confirmNew) && { opacity: 0.4 },
                ]}
                disabled={loading || success || !currentPin || !confirmCurrent || !newPin || !confirmNew}
                onPress={handleSubmit}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : (
                    <>
                      <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                      <Text style={s.sendBtnText}>Actualizar PIN</Text>
                    </>
                  )
                }
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, tone }: { icon: any; label: string; value: string; tone: "primary" | "green" | "amber" | "muted" }) {
  const toneColor =
    tone === "green"   ? Colors.green.primary :
    tone === "amber"   ? "#f59e0b" :
    tone === "muted"   ? "rgba(255,255,255,0.5)" : "#fff";
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: tone === "amber" ? "rgba(245,158,11,0.15)" : "rgba(46,204,90,0.15)" }]}>
        <Ionicons name={icon} size={16} color={tone === "amber" ? "#f59e0b" : Colors.green.primary} />
      </View>
      <Text style={[s.statValue, { color: toneColor }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Summary Row ──────────────────────────────────────────────────────────────
function SummaryRow({ label, value, icon, iconColor, isLast }: { label: string; value: string; icon: any; iconColor: string; isLast?: boolean }) {
  return (
    <View style={[s.summaryRow, !isLast && s.summaryRowBorder]}>
      <View style={[s.summaryIcon, { backgroundColor: iconColor + "22" }]}>
        <Ionicons name={icon} size={14} color={iconColor} />
      </View>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:               { flex: 1, backgroundColor: "#060f1e" },
  header:             { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  headerLeft:         { flexDirection: "row", alignItems: "center", gap: 10 },
  adminLogo:          { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(46,204,90,0.2)", alignItems: "center", justifyContent: "center" },
  adminBadgeRow:      { flexDirection: "row", alignItems: "center", gap: 6 },
  adminTitle:         { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  adminBadge:         { backgroundColor: Colors.green.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  adminBadgeText:     { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
  liveBadgeRow:       { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  liveDot:            { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green.primary },
  adminSubtitle:      { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  logoutBtn:          { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },

  tabBar:             { flexDirection: "row", marginHorizontal: 16, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 4 },
  tabBtn:             { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 9 },
  tabBtnActive:       { backgroundColor: "rgba(46,204,90,0.15)" },
  tabBtnText:         { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)" },
  tabBtnTextActive:   { color: Colors.green.primary },

  subTabBar:          { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3, marginBottom: 4 },
  subTabBtn:          { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8 },
  subTabBtnActive:    { backgroundColor: "rgba(46,204,90,0.18)" },
  subTabText:         { fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.45)" },
  subTabTextActive:   { color: Colors.green.primary, fontFamily: "Inter_600SemiBold" },

  scroll:             { flex: 1 },
  scrollContent:      { paddingHorizontal: 16, gap: 0 },

  statGrid:           { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard:           { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  statIcon:           { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statValue:          { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel:          { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", lineHeight: 14 },

  sectionTitle:       { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginTop: 18, marginBottom: 10 },

  summaryCard:        { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  summaryRow:         { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  summaryRowBorder:   { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  summaryIcon:        { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  summaryLabel:       { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  summaryValue:       { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  alertBanner:        { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)" },
  alertText:          { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#f59e0b" },

  broadcastCard:      { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(46,204,90,0.08)", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(46,204,90,0.2)" },
  broadcastIcon:      { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(46,204,90,0.15)", alignItems: "center", justifyContent: "center" },
  broadcastTitle:     { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  broadcastSubtitle:  { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },

  emptyState:         { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon:          { width: 80, height: 80, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  emptyTitle:         { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#fff" },
  emptyText:          { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", textAlign: "center", paddingHorizontal: 32 },

  withdrawCard:       { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  withdrawTop:        { flexDirection: "row", alignItems: "center", gap: 10 },
  withdrawAvatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(46,204,90,0.15)", alignItems: "center", justifyContent: "center" },
  withdrawAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.green.primary },
  withdrawUser:       { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  withdrawEmail:      { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  withdrawAmount:     { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.green.primary },
  beneficiaryRow:     { flexDirection: "row", alignItems: "center", gap: 5 },
  beneficiaryText:    { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)" },
  metaPill:           { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  metaPillClabe:      { backgroundColor: "rgba(46,204,90,0.1)", borderWidth: 1, borderColor: "rgba(46,204,90,0.25)" },
  metaPillCard:       { backgroundColor: "rgba(96,165,250,0.1)", borderWidth: 1, borderColor: "rgba(96,165,250,0.25)" },
  metaPillText:       { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.7)" },
  bankDetailsBox:     { backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  bankDetailRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bankDetailPills:    { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  accountNumberRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(46,204,90,0.06)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(46,204,90,0.15)", gap: 8 },
  accountNumberFull:  { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: "#ffffff", letterSpacing: 1.5 },
  copyBtn:            { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(46,204,90,0.15)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  copyBtnText:        { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.green.primary },
  accountLengthHint:  { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)" },
  withdrawDate:       { flexDirection: "row", alignItems: "center", gap: 5 },
  withdrawDateText:   { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },
  withdrawActions:    { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn:          { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  rejectBtn:          { backgroundColor: "rgba(248,113,113,0.15)", borderWidth: 1, borderColor: "rgba(248,113,113,0.3)" },
  approveBtn:         { backgroundColor: Colors.green.primary },
  actionBtnText:      { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  statusPill:         { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  statusPillText:     { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  userCard:           { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  userAvatar:         { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(46,204,90,0.15)", alignItems: "center", justifyContent: "center" },
  userAvatarText:     { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.green.primary },
  userName:           { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  userEmail:          { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  userJoined:         { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)" },
  userStats:          { alignItems: "flex-end", gap: 2 },
  userBalance:        { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.green.primary },
  userLifetime:       { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },
  levelBadge:         { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  levelBadgeText:     { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  modalBackdrop:      { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard:          { backgroundColor: "#0d1f35", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader:        { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIconWrap:      { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(46,204,90,0.15)", alignItems: "center", justifyContent: "center" },
  modalTitle:         { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  modalSubtitle:      { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", marginTop: 2 },
  modalCloseBtn:      { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },

  fieldLabel:         { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.6)", marginBottom: 6 },
  field:              { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 12, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular", color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  fieldMultiline:     { height: 100, textAlignVertical: "top" },
  charCount:          { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)", textAlign: "right", marginTop: 4 },
  sendBtn:            { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.green.primary, borderRadius: 14, paddingVertical: 14, marginTop: 8 },
  sendBtnText:        { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },

  confirmWarning:     { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)" },
  confirmWarningText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: "#f59e0b", lineHeight: 18 },
  confirmPreview:     { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  confirmDivider:     { height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  confirmPreviewLabel:{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.35)", letterSpacing: 0.8 },
  confirmPreviewTitle:{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  confirmPreviewBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", lineHeight: 18 },
  confirmRecipients:  { flexDirection: "row", alignItems: "center", gap: 6 },
  confirmRecipientsText:{ fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.green.primary },

  detailSection:      { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 4 },
  detailRow:          { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  detailEmpty:        { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)", textAlign: "center", paddingVertical: 12 },

  // ── Active Users Tab ───────────────────────────────────────────────────────
  activeBanner:       { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(46,204,90,0.08)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(46,204,90,0.2)", marginBottom: 4 },
  activeDotLarge:     { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.green.primary },
  activeBannerText:   { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },
  activeCard:         { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(46,204,90,0.15)" },
  activeAvatarWrap:   { position: "relative", width: 42, height: 42 },
  activeAvatarCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(46,204,90,0.2)", alignItems: "center", justifyContent: "center" },
  activeAvatarText:   { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.green.primary },
  onlineDot:          { position: "absolute", bottom: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: Colors.green.primary, borderWidth: 2, borderColor: "#060f1e" },
  activeUsername:     { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  activeEmail:        { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  activePill:         { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(46,204,90,0.12)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(46,204,90,0.25)" },
  activePillDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green.primary },
  activePillText:     { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.green.primary },
  activeConnectedAt:  { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)" },

  // ── Change PIN Modal ───────────────────────────────────────────────────────
  pinSectionDivider:  { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  pinSectionLabel:    { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.35)", letterSpacing: 0.8 },
  pinErrorRow:        { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(248,113,113,0.1)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "rgba(248,113,113,0.2)" },
  pinErrorText:       { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: "#f87171" },
});
