// Platform-aware entry. Metro picks `.native.ts` on iOS/Android and `.web.ts` on web.
export { default } from "./revenuecat";
export type { RcEntitlement, RcError, RevenueCatClient } from "./revenuecat-types";
