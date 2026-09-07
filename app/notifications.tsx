import React, { useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import i18n from "@/lib/i18n";
import {
  AppNotification,
  NotificationType,
  markAllAsRead,
  clearAllNotifications,
} from "@/lib/notifications";
import Colors from "@/constants/colors";

function iconFor(type: NotificationType): { name: any; color: string; bg: string } {
  switch (type) {
    case "payment_approved":
      return { name: "checkmark-circle", color: Colors.green.primary, bg: "rgba(46,204,90,0.15)" };
    case "payment_rejected":
      return { name: "close-circle", color: "#f87171", bg: "rgba(248,113,113,0.15)" };
    case "bonus":
      return { name: "gift", color: "#fbbf24", bg: "rgba(251,191,36,0.15)" };
    case "new_tasks":
      return { name: "play-circle", color: Colors.green.primary, bg: "rgba(46,204,90,0.15)" };
    case "broadcast":
      return { name: "megaphone", color: "#60a5fa", bg: "rgba(96,165,250,0.15)" };
    default:
      return { name: "information-circle", color: "rgba(255,255,255,0.6)", bg: "rgba(255,255,255,0.08)" };
  }
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { lang } = useLanguage();
  const t = i18n[lang].notifications;
  const queryClient = useQueryClient();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const email = currentUser?.email ?? "";
  const queryKey = ["/api/user/notifications"];

  const { data: items = [], isRefetching, refetch } = useQuery<AppNotification[]>({
    queryKey,
    enabled: !!email,
    refetchInterval: 8000,
    staleTime: 4000,
  });

  function timeAgo(ts: number): string {
    const diffMs = Date.now() - ts;
    const m = Math.floor(diffMs / 60000);
    if (m < 1) return t.now;
    if (m < 60) return t.minAgo(m);
    const h = Math.floor(m / 60);
    if (h < 24) return t.hAgo(h);
    const d = Math.floor(h / 24);
    if (d < 7) return t.dAgo(d);
    return new Date(ts).toLocaleDateString();
  }

  useFocusEffect(
    useCallback(() => {
      if (!email) return;
      refetch();
      const timeout = setTimeout(async () => {
        await markAllAsRead();
        queryClient.setQueryData<AppNotification[]>(queryKey, (old) =>
          (old ?? []).map((n) => ({ ...n, read: true }))
        );
        queryClient.invalidateQueries({ queryKey: ["/api/user/notifications"] });
      }, 800);
      return () => clearTimeout(timeout);
    }, [email, refetch])
  );

  const handleClear = () => {
    if (items.length === 0) return;
    const doClear = async () => {
      if (!currentUser) return;
      await clearAllNotifications();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.setQueryData(queryKey, []);
    };
    if (Platform.OS === "web") {
      if (window.confirm(t.confirmClear)) doClear();
      return;
    }
    Alert.alert(t.alertTitle, t.alertMsg, [
      { text: t.cancel, style: "cancel" },
      { text: t.delete, style: "destructive", onPress: doClear },
    ]);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#060f1e", "#0a1628", "#0d2010"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerTitle}>{t.title}</Text>
        </View>
        <Pressable
          style={[styles.iconBtn, items.length === 0 && { opacity: 0.4 }]}
          onPress={handleClear}
          disabled={items.length === 0}
          hitSlop={10}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPadding + 32 },
          items.length === 0 && { flexGrow: 1, justifyContent: "center" },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={Colors.green.primary}
          />
        }
      >
        {items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-outline" size={48} color="rgba(255,255,255,0.3)" />
            </View>
            <Text style={styles.emptyTitle}>{t.empty}</Text>
            <Text style={styles.emptyText}>{t.emptyText}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((n) => {
              const ic = iconFor(n.type as NotificationType);
              return (
                <View key={n.id} style={[styles.card, !n.read && styles.cardUnread]}>
                  <View style={[styles.cardIcon, { backgroundColor: ic.bg }]}>
                    <Ionicons name={ic.name} size={20} color={ic.color} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{n.title}</Text>
                      {!n.read && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.cardBody} numberOfLines={3}>{n.body}</Text>
                    <Text style={styles.cardTime}>{timeAgo(n.timestamp)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#060f1e" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  empty: { alignItems: "center", gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#fff" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", textAlign: "center", paddingHorizontal: 24, lineHeight: 20 },
  card: { flexDirection: "row", gap: 12, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  cardUnread: { borderColor: "rgba(46,204,90,0.3)", backgroundColor: "rgba(46,204,90,0.06)" },
  cardIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.green.primary },
  cardBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", lineHeight: 18 },
  cardTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)" },
});
