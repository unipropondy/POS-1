import "react-native-get-random-values";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useWindowDimensions } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import "react-native-reanimated";
import { ToastProvider } from "../components/Toast";

import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuthStore } from "../stores/authStore";
import { useRouter, useSegments, Slot } from "expo-router";

// Keep the splash screen visible while fonts load
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const user = useAuthStore((s) => s.user);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  // ✅ AUTH GUARD: Redirect based on auth state
  useEffect(() => {
    if (!fontsLoaded) return;

    const inAuthGroup = segments[0] === "(tabs)" || segments[0] === "menu";
    
    if (!user && inAuthGroup) {
      // Redirect to login if not logged in and trying to access protected routes
      router.replace("/login");
    } else if (user && segments[0] === "login") {
      // Redirect to dashboard if logged in and trying to access login
      const userName = (user.userName || "").trim().toUpperCase();
      if (userName === "KDS") {
        router.replace("/kds" as any);
      } else {
        router.replace("/(tabs)/category");
      }
    } else if (!user && segments.length === 0) {
      // Start at login if entering the app for the first time
      router.replace("/login");
    }
  }, [user, segments, fontsLoaded]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="menu" />
        </Stack>
        <StatusBar style="light" />
      </ToastProvider>
    </ThemeProvider>
  );
}