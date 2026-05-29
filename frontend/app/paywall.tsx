// Passaroo Paywall — monthly / yearly billing toggle, coupon codes, feature comparison.
// Reads pricing from /api/subscription/plans (single source of truth on the server).
// When RevenueCat keys are wired, the "Choose" buttons will trigger Purchases.purchasePackage().
// Until then they call the mock /api/user/plan endpoint so the rest of the app keeps working.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PButton } from "@/src/components/PButton";
import RevenueCat from "@/src/iap";
import { colors, IMAGES, radius, spacing, typography } from "@/src/theme";

type Period = "monthly" | "yearly";
type Tier = "free" | "premium" | "pro";

type ProductInfo = {
  sku: string;
  price_cents: number;
  price_display: string;
  period: string;
  tier: Tier;
  savings_pct?: number;
  monthly_equivalent?: string;
};

type PlansResponse = {
  currency: string;
  yearly_discount_percent: number;
  products: Record<string, ProductInfo>;
  tiers: Record<string, any>;
  marketing_features: Record<Tier, string[]>;
};

export default function Paywall() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Coupon
  const [couponCode, setCouponCode] = useState("");
  const [couponState, setCouponState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponInfo, setCouponInfo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<PlansResponse>("/subscription/plans");
        setPlans(r);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, []);

  const verifyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponState("checking");
    setCouponMsg(null);
    try {
      const r = await api<{ valid: boolean; coupon: any }>("/coupons/validate", {
        method: "POST",
        body: { code },
      });
      setCouponState("valid");
      setCouponInfo(r.coupon);
      setCouponMsg(describeCoupon(r.coupon));
    } catch (e: any) {
      setCouponState("invalid");
      setCouponInfo(null);
      setCouponMsg(e.message);
    }
  };

  const clearCoupon = () => {
    setCouponCode("");
    setCouponState("idle");
    setCouponInfo(null);
    setCouponMsg(null);
  };

  const choosePlan = async (tier: Tier) => {
    if (tier === "free") return;
    setErr(null);
    setUpgrading(tier);
    try {
      // If a valid coupon is present and it grants entitlement (trial/months) — redeem first.
      if (couponState === "valid" && couponInfo) {
        const grants = ["trial_days", "free_months"].includes(couponInfo.discount_type);
        if (grants) {
          await api("/coupons/redeem", {
            method: "POST",
            body: { code: couponInfo.code, plan: tier, billing_period: period },
          });
          await refresh();
          Alert.alert(
            "🎉 Coupon redeemed!",
            `Your ${describeCoupon(couponInfo)} is now active. Enjoy ${tier.toUpperCase()}!`,
            [{ text: "Awesome", onPress: () => router.back() }],
          );
          return;
        }
        // For percent/fixed, RC discount happens at checkout (Apple/Play handle it).
      }

      // ── Real in-app purchase via RevenueCat ───────────────────────
      if (RevenueCat.isEnabled) {
        const offering = await RevenueCat.getCurrentOffering();
        if (!offering) {
          throw new Error("Subscription products unavailable right now. Try again in a moment.");
        }
        // Find matching package: Premium uses RC built-in ids, Pro uses our custom ids
        const isYearly = period === "yearly";
        let pkg = null as any;
        if (tier === "premium") {
          pkg = isYearly ? offering.annual : offering.monthly;
        } else if (tier === "pro") {
          // Accept either "pro_annual" (RC default convention) or legacy "pro_yearly"
          pkg = offering.availablePackages.find(
            (p: any) =>
              p.identifier === (isYearly ? "pro_annual" : "pro_monthly") ||
              p.identifier === (isYearly ? "pro_yearly" : "pro_monthly"),
          );
        }
        if (!pkg) {
          throw new Error(`No matching ${tier} ${period} package configured in RevenueCat.`);
        }
        const result = await RevenueCat.purchasePackage(pkg);
        if (result.userCancelled) {
          return; // user backed out — no error
        }
        // The RC webhook will sync the entitlement to backend. Force-refresh anyway.
        await refresh();
        Alert.alert(
          "🎉 You're now " + tier.toUpperCase() + "!",
          "Thanks for upgrading. Enjoy unlimited learning!",
          [{ text: "Let's go", onPress: () => router.back() }],
        );
        return;
      }

      // ── Fallback (no RC keys yet — dev mock) ─────────────────────
      await api("/user/plan", { method: "POST", body: { plan: tier } });
      await refresh();
      Alert.alert(
        "Subscription updated (mock)",
        `You're now on the ${tier.toUpperCase()} plan in dev mode. Real in-app purchases will be enabled once RevenueCat keys are deployed.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUpgrading(null);
    }
  };

  const restorePurchases = async () => {
    if (!RevenueCat.isEnabled) {
      Alert.alert(
        "Not available",
        "Restore purchases is only available on the iOS and Android app builds.",
      );
      return;
    }
    setUpgrading("__restore__");
    try {
      const info = await RevenueCat.restorePurchases();
      await refresh();
      const hasAny = info && (
        RevenueCat.hasEntitlement(info, "premium") || RevenueCat.hasEntitlement(info, "pro")
      );
      Alert.alert(
        hasAny ? "✅ Purchases restored" : "Nothing to restore",
        hasAny ? "Your subscription has been re-applied." : "We didn't find any active subscription on this Apple/Google account.",
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUpgrading(null);
    }
  };

  if (loadingPlans) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!plans) {
    return (
      <SafeAreaView style={[styles.container, { padding: spacing.lg }]}>
        <Text style={styles.error}>{err || "Could not load plans"}</Text>
      </SafeAreaView>
    );
  }

  const premiumKey = period === "monthly" ? "premium_monthly" : "premium_yearly";
  const proKey = period === "monthly" ? "pro_monthly" : "pro_yearly";

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="paywall-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => router.back()} style={{ alignSelf: "flex-start" }} testID="paywall-close">
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Image source={{ uri: IMAGES.motif }} style={{ width: 180, height: 90 }} resizeMode="contain" />
          <Text style={styles.title}>Level up your study</Text>
          <Text style={styles.sub}>Unlock unlimited exams, AI tutor and more.</Text>
        </View>

        {/* Billing period toggle */}
        <View style={styles.toggleWrap}>
          <ToggleBtn
            label="Monthly"
            active={period === "monthly"}
            onPress={() => setPeriod("monthly")}
            testID="toggle-monthly"
          />
          <ToggleBtn
            label={`Yearly · Save ${plans.yearly_discount_percent}%`}
            active={period === "yearly"}
            onPress={() => setPeriod("yearly")}
            testID="toggle-yearly"
          />
        </View>

        {err && <Text style={styles.error} testID="paywall-error">{err}</Text>}

        {/* Free tier card */}
        <PlanCard
          tier="free"
          title="Free"
          price="AUD $0"
          period="forever"
          features={plans.marketing_features.free}
          isCurrent={user?.plan === "free"}
          onPress={() => choosePlan("free")}
          color={colors.bgAlt}
          textColor={colors.textPrimary}
          accent={colors.textSecondary}
          loading={false}
          disabled
        />

        {/* Premium */}
        <PlanCard
          tier="premium"
          title="Premium"
          price={`AUD ${plans.products[premiumKey].price_display}`}
          period={period === "monthly" ? "per month" : "per year"}
          subPrice={
            period === "yearly" && plans.products[premiumKey].monthly_equivalent
              ? `≈ ${plans.products[premiumKey].monthly_equivalent}/mo`
              : undefined
          }
          features={plans.marketing_features.premium}
          isCurrent={user?.plan === "premium"}
          onPress={() => choosePlan("premium")}
          loading={upgrading === "premium"}
          color="#fff"
          textColor={colors.textPrimary}
          accent={colors.premium}
          popular
          savingsTag={
            period === "yearly" ? `Save ${plans.yearly_discount_percent}% · best value` : undefined
          }
        />

        {/* Pro */}
        <PlanCard
          tier="pro"
          title="Pro"
          price={`AUD ${plans.products[proKey].price_display}`}
          period={period === "monthly" ? "per month" : "per year"}
          subPrice={
            period === "yearly" && plans.products[proKey].monthly_equivalent
              ? `≈ ${plans.products[proKey].monthly_equivalent}/mo`
              : undefined
          }
          features={plans.marketing_features.pro}
          isCurrent={user?.plan === "pro"}
          onPress={() => choosePlan("pro")}
          loading={upgrading === "pro"}
          color="#0A2A33"
          textColor="#fff"
          accent={colors.primaryGreen}
          savingsTag={
            period === "yearly" ? `Save ${plans.yearly_discount_percent}%` : undefined
          }
        />

        {/* Coupon code */}
        <View style={styles.couponBox} testID="coupon-box">
          <Text style={styles.couponTitle}>Have a coupon code?</Text>
          <View style={styles.couponRow}>
            <TextInput
              testID="coupon-input"
              value={couponCode}
              onChangeText={(t) => {
                setCouponCode(t.toUpperCase());
                if (couponState !== "idle") {
                  setCouponState("idle");
                  setCouponMsg(null);
                }
              }}
              placeholder="Enter code"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              style={[styles.couponInput, couponState === "valid" && { borderColor: colors.correct }]}
            />
            {couponState === "valid" ? (
              <TouchableOpacity onPress={clearCoupon} style={styles.couponBtn} testID="coupon-clear">
                <Ionicons name="close-circle" size={22} color={colors.wrong} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={verifyCoupon}
                style={[styles.couponBtn, { backgroundColor: colors.primaryDark }]}
                disabled={!couponCode.trim() || couponState === "checking"}
                testID="coupon-apply"
              >
                {couponState === "checking" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.couponBtnText}>Apply</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          {couponMsg && (
            <Text
              style={[
                styles.couponMsg,
                { color: couponState === "valid" ? colors.correct : colors.wrong },
              ]}
              testID="coupon-msg"
            >
              {couponState === "valid" ? "✓ " : "✗ "}
              {couponMsg}
            </Text>
          )}
        </View>

        {/* Feature comparison */}
        <Text style={styles.compareTitle}>Compare plans</Text>
        <View style={styles.compareTable}>
          <CompareRow label="Mock exams per week" free="2" premium="15" pro="Unlimited*" header />
          <CompareRow label="Ads" free="Yes" premium="No" pro="No" />
          <CompareRow label="AI explanations" free="5/day" premium="100/day" pro="500/day" />
          <CompareRow label="AI Tutor chat" free="—" premium="✓" pro="✓ Priority" />
          <CompareRow label="Weak-topic analysis" free="—" premium="✓" pro="✓" />
          <CompareRow label="Study planner" free="—" premium="✓" pro="✓" />
          <CompareRow label="Reading materials" free="—" premium="✓" pro="✓" />
          <CompareRow label="Advanced analytics" free="—" premium="✓" pro="✓" />
          <CompareRow label="Voice tutor (soon)" free="—" premium="—" pro="✓" />
          <CompareRow label="Interview prep (soon)" free="—" premium="—" pro="✓" />
          <CompareRow label="Early access features" free="—" premium="—" pro="✓" />
        </View>

        <Text style={styles.disclaimer}>
          * Pro is marketed as Unlimited Practice Exams and includes a fair-use cap of 50 exams/week to keep the
          service available for everyone. Subscriptions auto-renew until cancelled. Manage from your App Store or
          Google Play settings.
        </Text>

        <TouchableOpacity onPress={restorePurchases} style={styles.restoreBtn} testID="restore-purchases">
          <Ionicons name="refresh" size={16} color={colors.primaryDark} />
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          <TouchableOpacity onPress={() => router.push("/terms")} testID="link-terms">
            <Text style={styles.link}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.linkSep}>·</Text>
          <TouchableOpacity onPress={() => router.push("/refund-policy")} testID="link-refund">
            <Text style={styles.link}>Refund Policy</Text>
          </TouchableOpacity>
          <Text style={styles.linkSep}>·</Text>
          <TouchableOpacity onPress={() => router.push("/privacy")} testID="link-privacy">
            <Text style={styles.link}>Privacy</Text>
          </TouchableOpacity>
          <Text style={styles.linkSep}>·</Text>
          <TouchableOpacity onPress={() => router.push("/disclaimer")} testID="link-disclaimer">
            <Text style={styles.link}>Disclaimer</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function describeCoupon(c: any): string {
  if (!c) return "";
  switch (c.discount_type) {
    case "percent":
      return `${c.discount_value}% off applied at checkout`;
    case "fixed":
      return `$${(c.discount_value / 100).toFixed(2)} off at checkout`;
    case "trial_days":
      return `${c.discount_value}-day free trial`;
    case "free_months":
      return `${c.discount_value} free month${c.discount_value === 1 ? "" : "s"}`;
    default:
      return c.description || "Coupon applied";
  }
}

function ToggleBtn({
  label, active, onPress, testID,
}: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      testID={testID}
      style={[styles.toggleBtn, active && styles.toggleBtnActive]}
    >
      <Text style={[styles.toggleText, active && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

type PlanCardProps = {
  tier: Tier;
  title: string;
  price: string;
  period: string;
  subPrice?: string;
  features: string[];
  isCurrent: boolean;
  onPress: () => void;
  color: string;
  textColor: string;
  accent: string;
  loading: boolean;
  popular?: boolean;
  disabled?: boolean;
  savingsTag?: string;
};

function PlanCard(props: PlanCardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: props.color, borderColor: props.accent },
        props.popular && { borderBottomWidth: 6 },
      ]}
      testID={`plan-${props.tier}`}
    >
      {props.popular && (
        <View style={[styles.tag, { backgroundColor: props.accent }]}>
          <Text style={styles.tagText}>MOST POPULAR</Text>
        </View>
      )}
      <Text style={[styles.planName, { color: props.textColor }]}>{props.title}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 4 }}>
        <Text style={[styles.price, { color: props.accent }]}>{props.price}</Text>
        <Text style={[styles.period, { color: props.textColor, opacity: 0.6, marginBottom: 6 }]}>
          {props.period}
        </Text>
      </View>
      {props.subPrice && (
        <Text style={[styles.subPrice, { color: props.textColor }]}>{props.subPrice}</Text>
      )}
      {props.savingsTag && (
        <View style={[styles.savingsPill, { backgroundColor: props.accent + "22", borderColor: props.accent }]}>
          <Text style={[styles.savingsText, { color: props.accent }]}>{props.savingsTag}</Text>
        </View>
      )}
      <View style={{ gap: 8, marginTop: spacing.md }}>
        {props.features.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={18} color={props.accent} />
            <Text style={{ color: props.textColor, fontWeight: "600", flex: 1 }}>{f}</Text>
          </View>
        ))}
      </View>
      <PButton
        title={props.isCurrent ? "Current plan" : props.tier === "free" ? "Default" : `Choose ${props.title}`}
        onPress={props.onPress}
        disabled={props.isCurrent || props.disabled}
        loading={props.loading}
        variant={props.tier === "pro" ? "success" : "primary"}
        style={{ marginTop: spacing.lg }}
        testID={`select-${props.tier}`}
      />
    </View>
  );
}

function CompareRow({
  label, free, premium, pro, header,
}: { label: string; free: string; premium: string; pro: string; header?: boolean }) {
  return (
    <View style={[styles.compareRow, header && styles.compareRowHeader]}>
      <Text style={[styles.compareLabel, header && { fontWeight: "800" }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.compareCell}>{free}</Text>
      <Text style={[styles.compareCell, { color: colors.premium, fontWeight: "800" }]}>{premium}</Text>
      <Text style={[styles.compareCell, { color: colors.primaryGreenDark, fontWeight: "800" }]}>{pro}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  header: { alignItems: "center", gap: 4, marginBottom: spacing.sm },
  title: { ...typography.h1, fontSize: 26, textAlign: "center" },
  sub: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  error: { color: colors.wrong, textAlign: "center", fontWeight: "700" },
  toggleWrap: {
    flexDirection: "row", gap: 0, backgroundColor: colors.bgAlt,
    padding: 4, borderRadius: 999, alignSelf: "center", marginVertical: spacing.sm,
  },
  toggleBtn: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 999 },
  toggleBtnActive: { backgroundColor: colors.primaryDark },
  toggleText: { fontWeight: "800", color: colors.textSecondary, fontSize: 13 },
  card: {
    borderRadius: radius.xl, padding: spacing.lg,
    borderWidth: 2, borderBottomWidth: 4,
  },
  tag: {
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, marginBottom: 8,
  },
  tagText: { color: "#fff", fontWeight: "800", letterSpacing: 1, fontSize: 11 },
  planName: { fontWeight: "800", fontSize: 24 },
  price: { fontWeight: "800", fontSize: 32 },
  period: { fontSize: 13, fontWeight: "600" },
  subPrice: { fontSize: 13, fontWeight: "600", opacity: 0.8, marginTop: 2 },
  savingsPill: {
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, marginTop: 8, borderWidth: 1.5,
  },
  savingsText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  featureRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  couponBox: {
    backgroundColor: colors.bgAlt, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 2, borderColor: colors.border,
  },
  couponTitle: { fontWeight: "800", fontSize: 15, color: colors.textPrimary, marginBottom: 8 },
  couponRow: { flexDirection: "row", gap: 8 },
  couponInput: {
    flex: 1, backgroundColor: "#fff", borderWidth: 2, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, fontWeight: "700", fontSize: 15,
    color: colors.textPrimary, letterSpacing: 1,
  },
  couponBtn: {
    paddingHorizontal: 18, justifyContent: "center", alignItems: "center",
    borderRadius: radius.md, minWidth: 64,
  },
  couponBtnText: { color: "#fff", fontWeight: "800", letterSpacing: 0.5 },
  couponMsg: { marginTop: 8, fontSize: 13, fontWeight: "700" },
  compareTitle: { ...typography.h3, marginTop: spacing.md },
  compareTable: {
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg,
    overflow: "hidden", backgroundColor: "#fff",
  },
  compareRow: {
    flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderColor: colors.border, alignItems: "center",
  },
  compareRowHeader: { backgroundColor: colors.bgAlt },
  compareLabel: { flex: 2, fontWeight: "600", fontSize: 13, color: colors.textPrimary },
  compareCell: { flex: 1, fontWeight: "600", fontSize: 13, color: colors.textSecondary, textAlign: "center" },
  disclaimer: { ...typography.caption, fontSize: 11, textAlign: "center", color: colors.textTertiary, marginTop: spacing.md },
  link: { fontSize: 12, fontWeight: "700", color: colors.primaryDark, textDecorationLine: "underline" },
  linkSep: { color: colors.textTertiary, fontSize: 12 },
  restoreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, marginTop: spacing.sm,
  },
  restoreText: { color: colors.primaryDark, fontWeight: "800", fontSize: 14, textDecorationLine: "underline" },
});
