// No-op RevenueCat wrapper for web preview & SSR.
// `react-native-purchases` cannot run in a browser, so this stub keeps the
// app importable on web while still satisfying the `RevenueCatClient` shape.
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from "react-native-purchases";

import type { RcEntitlement, RevenueCatClient } from "./revenuecat-types";

const client: RevenueCatClient = {
  isEnabled: false,
  configure() {},
  async logIn() { return { customerInfo: null, created: false }; },
  async logOut(): Promise<CustomerInfo | null> { return null; },
  async getCurrentOffering(): Promise<PurchasesOffering | null> { return null; },
  async getCustomerInfo(): Promise<CustomerInfo | null> { return null; },
  async purchasePackage(_pkg: PurchasesPackage) {
    throw new Error("In-app purchases are only available in the mobile app.");
  },
  async restorePurchases(): Promise<CustomerInfo | null> { return null; },
  hasEntitlement(_info: CustomerInfo | null, _ent: RcEntitlement): boolean { return false; },
};

export default client;
