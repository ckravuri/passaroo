// Reusable banner ad component with built-in "Remove ads" CTA.
// Renders NOTHING for ad-free users (premium/pro), on web, or in Expo Go.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAuth } from "@/src/auth";
import { colors, radius, spacing } from "@/src/theme";

import { AdPlacement, getAdUnitId, isAdsSupported } from "./config";
import { initMobileAds } from "./initAds";

type Props = {
  placement: Exclude<AdPlacement, "exam-interstitial">;
  testID?: string;
};

export function PassarooBannerAd({ placement, testID }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [BannerAd, setBannerAd] = useState<any>(null);
  const [BannerAdSize, setBannerAdSize] = useState<any>(null);
  const [adFailed, setAdFailed] = useState(false);

  const isAdFree = user?.plan === "premium" || user?.plan === "pro";
  const supported = isAdsSupported();

  // Lazy-load the native module only when we actually need it.
  useEffect(() => {
    if (!supported || isAdFree) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("react-native-google-mobile-ads");
        await initMobileAds();
        if (!cancelled) {
          setBannerAd(() => mod.BannerAd);
          setBannerAdSize(mod.BannerAdSize);
        }
      } catch (e) {
        console.warn("[ads] banner module load failed", e);
        setAdFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported, isAdFree]);

  // No ads for premium/pro, web, Expo Go, or load failures.
  if (isAdFree || !supported || adFailed || !BannerAd || !BannerAdSize) {
    return null;
  }

  const unitId = getAdUnitId(placement);

  return (
    <View style={styles.container} testID={testID}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER || BannerAdSize.BANNER}
        onAdFailedToLoad={(err: any) => {
          console.warn("[ads] banner failed:", err?.message ?? err);
          setAdFailed(true);
        }}
      />
      <TouchableOpacity
        style={styles.removeAds}
        onPress={() => router.push("/paywall")}
        activeOpacity={0.8}
        testID={`${testID ?? "banner"}-remove-ads"`}
      >
        <Ionicons name="close-circle" size={14} color={colors.primaryDark} />
        <Text style={styles.removeAdsText}>Remove ads</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing.xs,
    backgroundColor: "#fff",
    borderTopWidth: Platform.OS === "web" ? 0 : 1,
    borderTopColor: colors.border,
  },
  removeAds: {
    position: "absolute",
    top: 2,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.bgAlt,
    borderRadius: radius.lg,
  },
  removeAdsText: { fontSize: 10, fontWeight: "800", color: colors.primaryDark },
});
