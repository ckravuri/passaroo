// RevenueCat wrapper for iOS / Android.
// SAFE TO IMPORT BEFORE KEYS EXIST: configure() returns early if no key is set,
// so the EAS build can ship with `react-native-purchases` baked in but inert.
// Once you set EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY on EAS, the
// next launch flips this on without another code change.
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";
import { Platform } from "react-native";

import { api } from "@/src/api";

import type { RcEntitlement, RevenueCatClient } from "./revenuecat-types";

const IOS_KEY = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? "";

function pickKey(): string {
  if (Platform.OS === "ios") return IOS_KEY;
  if (Platform.OS === "android") return ANDROID_KEY;
  return "";
}

let configured = false;
let configuring: Promise<void> | null = null;

async function ensureConfigured(appUserId?: string | null): Promise<void> {
  if (configured) return;
  if (configuring) return configuring;
  const apiKey = pickKey();
  if (!apiKey) {
    if (__DEV__) {
      console.info(
        "[RevenueCat] No API key set (EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY)." +
        " SDK will stay disabled — paywall will fall back to mock /user/plan endpoint.",
      );
    }
    return;
  }
  configuring = (async () => {
    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
      Purchases.configure({ apiKey, appUserID: appUserId ?? null });
      configured = true;
    } catch (e) {
      console.warn("[RevenueCat] configure failed:", e);
    } finally {
      configuring = null;
    }
  })();
  return configuring;
}

const client: RevenueCatClient = {
  get isEnabled() {
    return !!pickKey();
  },

  async configure(appUserId) {
    await ensureConfigured(appUserId);
  },

  async logIn(appUserId: string) {
    await ensureConfigured(appUserId);
    if (!configured) return { customerInfo: null, created: false };
    try {
      const res = await Purchases.logIn(appUserId);
      // Sync RC app user id back to our backend so webhooks resolve to the right user.
      try {
        await api("/iap/link-rc-user", {
          method: "POST",
          body: { rc_app_user_id: appUserId },
        });
      } catch (e) {
        if (__DEV__) console.warn("[RevenueCat] link-rc-user failed (non-fatal):", e);
      }
      return { customerInfo: res.customerInfo, created: res.created };
    } catch (e) {
      console.warn("[RevenueCat] logIn failed:", e);
      return { customerInfo: null, created: false };
    }
  },

  async logOut() {
    if (!configured) return null;
    try {
      const info = await Purchases.logOut();
      return info;
    } catch (e) {
      console.warn("[RevenueCat] logOut failed:", e);
      return null;
    }
  },

  async getCurrentOffering(): Promise<PurchasesOffering | null> {
    if (!configured) return null;
    try {
      const offerings = await Purchases.getOfferings();
      return offerings.current ?? null;
    } catch (e) {
      console.warn("[RevenueCat] getOfferings failed:", e);
      return null;
    }
  },

  async getCustomerInfo(): Promise<CustomerInfo | null> {
    if (!configured) return null;
    try {
      return await Purchases.getCustomerInfo();
    } catch (e) {
      console.warn("[RevenueCat] getCustomerInfo failed:", e);
      return null;
    }
  },

  async purchasePackage(pkg: PurchasesPackage) {
    if (!configured) {
      throw new Error("RevenueCat is not configured. Set EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY.");
    }
    try {
      const result = await Purchases.purchasePackage(pkg);
      return { customerInfo: result.customerInfo, userCancelled: false };
    } catch (e: any) {
      if (e?.userCancelled) {
        return { customerInfo: null, userCancelled: true };
      }
      throw e;
    }
  },

  async restorePurchases() {
    if (!configured) return null;
    try {
      return await Purchases.restorePurchases();
    } catch (e) {
      console.warn("[RevenueCat] restorePurchases failed:", e);
      return null;
    }
  },

  hasEntitlement(info: CustomerInfo | null, ent: RcEntitlement): boolean {
    if (!info) return false;
    const e = info.entitlements?.active?.[ent];
    return !!(e && e.isActive);
  },
};

export default client;
