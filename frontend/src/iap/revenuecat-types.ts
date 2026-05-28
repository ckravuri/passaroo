// Shared interface implemented by both .native and .web variants of the
// RevenueCat wrapper. Lets the rest of the codebase import a single
// `revenuecat` module and stay platform-agnostic.
import type {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  PurchasesError,
} from "react-native-purchases";

export type RcEntitlement = "premium" | "pro";

export interface RevenueCatClient {
  /** True only on iOS/Android with a valid API key in env. False on web or in dev without keys. */
  isEnabled: boolean;
  /** Idempotent — safe to call multiple times. Reads keys from env. */
  configure(appUserId?: string | null): Promise<void> | void;
  /** Bind logged-in user to RC and sync our backend (/api/iap/link-rc-user). */
  logIn(appUserId: string): Promise<{ customerInfo: CustomerInfo | null; created: boolean }>;
  /** Detach the user from this device's RC identity (e.g. on signout). */
  logOut(): Promise<CustomerInfo | null>;
  /** Fetch the current Offering (current packages to show on paywall). */
  getCurrentOffering(): Promise<PurchasesOffering | null>;
  /** Read live entitlements (post-purchase / on app foreground). */
  getCustomerInfo(): Promise<CustomerInfo | null>;
  /** Trigger a real native purchase. Throws on error. */
  purchasePackage(pkg: PurchasesPackage): Promise<{ customerInfo: CustomerInfo | null; userCancelled: boolean }>;
  /** Restore prior purchases (App Store / Play). */
  restorePurchases(): Promise<CustomerInfo | null>;
  /** Quick boolean check on entitlements. */
  hasEntitlement(info: CustomerInfo | null, ent: RcEntitlement): boolean;
}

export type RcError = PurchasesError & { userCancelled?: boolean };
