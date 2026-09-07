import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Platform,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useLanguage } from "@/context/LanguageContext";
import i18n from "@/lib/i18n";
import Colors from "@/constants/colors";

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const { lang } = useLanguage();
  const t = i18n[lang].rewards;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#060f1e", "#0a1628", "#0d2010"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.centerContent}>
        <LinearGradient
          colors={["rgba(46,204,90,0.18)", "rgba(26,122,54,0.08)"]}
          style={styles.iconCircle}
        >
          <Ionicons name="gift" size={48} color={Colors.green.primary} />
        </LinearGradient>

        <Text style={styles.comingSoonTitle}>{t.comingSoon}</Text>
        <Text style={styles.comingSoonSub}>{t.comingSoonSub}</Text>
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
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
  },
  headerSpacer: { width: 38 },

  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 20,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.25)",
  },
  comingSoonTitle: {
    fontSize: 22,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  comingSoonSub: {
    fontSize: 15,
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlign: "center",
  },
});
