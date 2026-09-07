import * as Updates from "expo-updates";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "@/context/LanguageContext";
import i18n from "@/lib/i18n";
import Colors from "@/constants/colors";

export function UpdateBanner() {
  const { lang } = useLanguage();
  const t = i18n[lang].updates;
  const insets = useSafeAreaInsets();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (Platform.OS === "web" || !Updates.isEnabled) return;

    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setUpdateAvailable(true);
      }
    } catch (error) {
      // An unavailable network must not prevent the app from opening.
      console.warn("[updates] Could not check for an available update", error);
    }
  }, []);

  useEffect(() => {
    void checkForUpdate();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkForUpdate();
      }
    });

    return () => subscription.remove();
  }, [checkForUpdate]);

  const applyUpdate = async () => {
    setIsUpdating(true);

    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (error) {
      setIsUpdating(false);
      console.warn("[updates] Could not download the available update", error);
    }
  };

  if (!updateAvailable) return null;

  return (
    <View style={[styles.wrapper, { top: Math.max(insets.top, 12) + 10 }]}>
      <View style={styles.banner}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-download-outline" size={20} color={Colors.green.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.message}>{t.message}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.button}
          onPress={applyUpdate}
          disabled={isUpdating}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color="#06101f" />
          ) : (
            <Text style={styles.buttonText}>{t.button}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 10000,
    elevation: 10000,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#102342",
    borderWidth: 1,
    borderColor: "rgba(46,204,90,0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.green.muted,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  message: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
  },
  button: {
    minWidth: 74,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.green.primary,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonText: {
    color: "#06101f",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
});