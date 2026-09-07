import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pin-verify" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  );
}
