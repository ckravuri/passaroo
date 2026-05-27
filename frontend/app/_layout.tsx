import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/auth";
import { initMobileAds } from "@/src/ads/initAds";

// Module-scope push handlers (per Emergent push playbook).
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data || {};
      if (Platform.OS === "android" && typeof data.supr_send_n_pl === "string") {
        return {
          shouldShowAlert: false, shouldShowBanner: false, shouldShowList: false,
          shouldPlaySound: false, shouldSetBadge: false,
        } as any;
      }
      return {
        shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true,
        shouldPlaySound: true, shouldSetBadge: false,
      } as any;
    },
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const router = useRouter();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    // Initialize AdMob SDK once at app launch (no-op in Expo Go/web).
    initMobileAds().catch((e) => console.warn("[ads] init at startup failed", e));

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data || {};
      let url: string | undefined = data.deeplink || data.action_url;
      if (!url && typeof data.supr_send_n_pl === "string") {
        try {
          const parsed = JSON.parse(data.supr_send_n_pl);
          url = parsed.deeplink || parsed.action_url;
        } catch {}
      }
      if (!url) return;
      if (url.startsWith("http")) Linking.openURL(url);
      else router.push(url as any);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data: any = response.notification.request.content.data || {};
      let url: string | undefined = data.deeplink || data.action_url;
      if (!url && typeof data.supr_send_n_pl === "string") {
        try {
          const parsed = JSON.parse(data.supr_send_n_pl);
          url = parsed.deeplink || parsed.action_url;
        } catch {}
      }
      if (!url) return;
      if (url.startsWith("http")) Linking.openURL(url);
      else router.push(url as any);
    });

    return () => {
      tapSub.remove();
    };
  }, [router]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
