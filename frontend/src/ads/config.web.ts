// Web stub — ads are not supported on web. Returns harmless defaults.
export type AdPlacement = "dashboard-banner" | "results-banner" | "exam-interstitial";
export const isExpoGo = true;
export function isAdsSupported(): boolean { return false; }
export function getAdUnitId(_p: AdPlacement): string { return ""; }
