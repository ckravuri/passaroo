// Hook for interstitial ad triggered every Nth exam submission.
// On the 2nd, 4th, 6th... call to trigger(), shows an interstitial if loaded.
// Silent no-op for premium/pro, web, Expo Go, or load failures.
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/src/auth";

import { getAdUnitId, isAdsSupported } from "./config";
import { initMobileAds } from "./initAds";

type Options = { showEveryN?: number };

export function useExamInterstitialAd(opts: Options = {}) {
  const { showEveryN = 2 } = opts;
  const { user } = useAuth();
  const isAdFree = user?.plan === "premium" || user?.plan === "pro";
  const supported = isAdsSupported();
  const enabled = supported && !isAdFree;

  const adRef = useRef<any>(null);
  const counterRef = useRef(0);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadAd = useCallback(async () => {
    if (!enabled) return;
    try {
      const { InterstitialAd, AdEventType } = await import("react-native-google-mobile-ads");
      await initMobileAds();
      const ad = InterstitialAd.createForAdRequest(getAdUnitId("exam-interstitial"), {
        requestNonPersonalizedAdsOnly: false,
      });
      const offLoaded = ad.addAdEventListener(AdEventType.LOADED, () => setIsLoaded(true));
      const offClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        setIsLoaded(false);
        // Pre-load next interstitial in the background.
        setTimeout(() => ad.load(), 500);
      });
      const offError = ad.addAdEventListener(AdEventType.ERROR, (err: any) => {
        console.warn("[ads] interstitial error", err?.message ?? err);
        setIsLoaded(false);
      });
      adRef.current = { ad, offLoaded, offClosed, offError };
      ad.load();
    } catch (e) {
      console.warn("[ads] interstitial load failed", e);
    }
  }, [enabled]);

  useEffect(() => {
    loadAd();
    return () => {
      const r = adRef.current;
      if (r) {
        try { r.offLoaded?.(); r.offClosed?.(); r.offError?.(); } catch {}
      }
      adRef.current = null;
    };
  }, [loadAd]);

  /** Call this once per qualifying user action (e.g., per mock-exam submit). */
  const trigger = useCallback(() => {
    if (!enabled) return;
    counterRef.current += 1;
    const shouldShow = counterRef.current % showEveryN === 0;
    if (shouldShow && isLoaded && adRef.current?.ad) {
      try {
        adRef.current.ad.show();
      } catch (e) {
        console.warn("[ads] interstitial show failed", e);
      }
    }
  }, [enabled, isLoaded, showEveryN]);

  return { trigger, isLoaded, enabled };
}
