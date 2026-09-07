import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BalanceProvider } from "@/context/BalanceContext";
import { CurrencyProvider, useCurrency } from "@/context/CurrencyContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { UpdateBanner } from "@/components/UpdateBanner";

SplashScreen.preventAutoHideAsync();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoaded, isAdminPinVerified } = useAuth();
  const { hasChosen, isLoaded: currencyLoaded } = useCurrency();
  const segments = useSegments();

  useEffect(() => {
    if (!isLoaded) return;

    const root             = segments[0] as string | undefined;
    const inAuthGroup      = root === "(auth)";
    const inAdminGroup     = root === "(admin)";
    const inTabsGroup      = root === "(tabs)";
    const inCurrencySelect = root === "currency-select";
    const inPinVerify      = inAdminGroup && segments[1] === "pin-verify";
    const inAdminIndex     = inAdminGroup && !inPinVerify;

    // ── Unauthenticated ──────────────────────────────────────────────────
    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
      return;
    }

    // ── Admin flow ───────────────────────────────────────────────────────
    if (isAuthenticated && isAdmin) {
      // After login: route to PIN screen first, not admin panel directly
      if (inAuthGroup) {
        router.replace(isAdminPinVerified ? "/(admin)" : "/(admin)/pin-verify");
        return;
      }
      // Admin in tabs group → redirect appropriately
      if (inTabsGroup) {
        router.replace(isAdminPinVerified ? "/(admin)" : "/(admin)/pin-verify");
        return;
      }
      // PIN not verified → must stay on pin-verify
      if (!isAdminPinVerified && inAdminIndex) {
        router.replace("/(admin)/pin-verify");
        return;
      }
      // PIN already verified → leave pin-verify screen
      if (isAdminPinVerified && inPinVerify) {
        router.replace("/(admin)");
        return;
      }
      return; // admin in correct place
    }

    // ── Regular user flow ────────────────────────────────────────────────
    if (isAuthenticated && !isAdmin) {
      if (inAuthGroup) {
        router.replace("/(tabs)");
        return;
      }
      if (inAdminGroup) {
        router.replace("/(tabs)");
        return;
      }
      if (currencyLoaded && !hasChosen && !inCurrencySelect) {
        router.replace("/currency-select");
        return;
      }
      if (hasChosen && inCurrencySelect) {
        router.replace("/(tabs)");
      }
    }
  }, [isAuthenticated, isAdmin, isLoaded, isAdminPinVerified, hasChosen, currencyLoaded, segments[0], segments[1]]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <AuthGuard>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
            animation: "fade",
          }}
        />
        <Stack.Screen
          name="watch-videos"
          options={{
            headerShown: false,
            animation: "slide_from_bottom",
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="withdraw"
          options={{
            headerShown: false,
            animation: "slide_from_bottom",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="history"
          options={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="rewards"
          options={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="currency-select"
          options={{
            headerShown: false,
            animation: "fade",
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="complete-tasks"
          options={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="task-verification"
          options={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        />
      </Stack>
    </AuthGuard>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  const [splashDone, setSplashDone] = useState(false);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LanguageProvider>
          <CurrencyProvider>
            <BalanceProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                  <UpdateBanner />
                  {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
                </KeyboardProvider>
              </GestureHandlerRootView>
            </BalanceProvider>
          </CurrencyProvider>
          </LanguageProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
