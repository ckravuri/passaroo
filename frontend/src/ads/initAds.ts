// One-time SDK init + ATT (App Tracking Transparency) flow.
import { Platform } from "react-native";

import { isAdsSupported } from "./config";

let initialized = false;

export async function initMobileAds(): Promise<boolean> {
  if (initialized) return true;
  if (!isAdsSupported()) return false;

  try {
    // iOS: ask for ATT permission before initializing.
    if (Platform.OS === "ios") {
      try {
        // Lazy import — module is iOS-only.
        const att = await import("expo-tracking-transparency");
        const current = await att.getTrackingPermissionsAsync();
        if (!current.granted && current.canAskAgain) {
          await att.requestTrackingPermissionsAsync();
        }
      } catch (e) {
        // ATT prompt failed — ads still work (just non-personalized).
        console.warn("[ads] ATT request failed:", e);
      }
    }

    // Lazy import the native module — only loaded outside Expo Go / web.
    const { default: mobileAds, MaxAdContentRating } = await import("react-native-google-mobile-ads");
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.T,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
    initialized = true;
    return true;
  } catch (e) {
    console.warn("[ads] initialization failed:", e);
    return false;
  }
}
