// Push notification registration helper.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/src/api";

export async function registerForPush(user_id: string) {
  if (Platform.OS === "web") return;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== "granted") return;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api("/register-push", {
      method: "POST",
      auth: false,
      body: {
        user_id,
        platform: Platform.OS,
        device_token: tokenResp.data,
      },
    });
  } catch (e) {
    // silently ignore — push is a nice-to-have, not blocking
    console.log("[push] registration failed:", e);
  }
}
