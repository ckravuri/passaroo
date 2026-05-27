// Ad unit ID resolver.
// In dev / Expo Go / web → Google's TestIds (safe, no policy risk).
// In production builds → read from EXPO_PUBLIC_PROD_* env vars (set in EAS).
import Constants from "expo-constants";
import { Platform } from "react-native";

// Safe import: TestIds constants are pure JS, no native code needed.
import { TestIds } from "react-native-google-mobile-ads";

export type AdPlacement = "dashboard-banner" | "results-banner" | "exam-interstitial";

// Are we running inside Expo Go? (Ads cannot work in Expo Go — only EAS builds.)
export const isExpoGo = Constants.appOwnership === "expo";

// True for development builds OR Expo Go OR web.
const isDev = __DEV__ || isExpoGo;

export function isAdsSupported(): boolean {
  if (Platform.OS === "web") return false;
  if (isExpoGo) return false; // RN module not present in Expo Go
  return Platform.OS === "android" || Platform.OS === "ios";
}

export function getAdUnitId(placement: AdPlacement): string {
  // Dev / preview → always Google's TestIds (no live ads).
  if (isDev) {
    return placement === "exam-interstitial" ? TestIds.INTERSTITIAL : TestIds.BANNER;
  }

  const isAndroid = Platform.OS === "android";

  if (placement === "dashboard-banner") {
    return (isAndroid
      ? process.env.EXPO_PUBLIC_PROD_ADMOB_BANNER_DASHBOARD_ANDROID
      : process.env.EXPO_PUBLIC_PROD_ADMOB_BANNER_DASHBOARD_IOS) || TestIds.BANNER;
  }
  if (placement === "results-banner") {
    return (isAndroid
      ? process.env.EXPO_PUBLIC_PROD_ADMOB_BANNER_RESULTS_ANDROID
      : process.env.EXPO_PUBLIC_PROD_ADMOB_BANNER_RESULTS_IOS) || TestIds.BANNER;
  }
  if (placement === "exam-interstitial") {
    return (isAndroid
      ? process.env.EXPO_PUBLIC_PROD_ADMOB_INTERSTITIAL_EXAM_ANDROID
      : process.env.EXPO_PUBLIC_PROD_ADMOB_INTERSTITIAL_EXAM_IOS) || TestIds.INTERSTITIAL;
  }
  return "";
}
