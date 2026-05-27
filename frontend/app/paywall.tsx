// Subscription paywall — Free / Premium / Pro tiers.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PButton } from "@/src/components/PButton";
import { colors, IMAGES, radius, spacing, typography } from "@/src/theme";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "AUD $0",
    period: "forever",
    features: ["2 exams per week", "Limited AI explanations", "Flashcards access", "Streak system", "Ads supported"],
    color: colors.bgAlt,
    textColor: colors.textPrimary,
    accent: colors.textSecondary,
  },
  {
    id: "premium",
    name: "Premium",
    price: "AUD $7.99",
    period: "per month",
    features: ["15 exams per week", "AI Tutor chat", "AI explanations", "Weak topic analysis", "No ads"],
    color: "#fff",
    textColor: colors.textPrimary,
    accent: colors.premium,
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "AUD $14.99",
    period: "per month",
    features: ["Unlimited exams (fair use)", "Unlimited AI", "Advanced analytics", "Priority features", "Future voice tutor"],
    color: "#0A2A33",
    textColor: "#fff",
    accent: colors.primaryGreen,
  },
];

export default function Paywall() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const select = async (plan: string) => {
    setErr(null);
    setUpgrading(plan);
    try {
      await api("/user/plan", { method: "POST", body: { plan } });
      await refresh();
      router.back();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUpgrading(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="paywall-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => router.back()} style={{ alignSelf: "flex-start" }} testID="paywall-close">
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Image source={{ uri: IMAGES.motif }} style={{ width: 200, height: 100 }} resizeMode="contain" />
          <Text style={styles.title}>Level up your study</Text>
          <Text style={styles.sub}>Unlock AI tutoring, unlimited exams and more.</Text>
        </View>

        {err && <Text style={{ color: colors.wrong, textAlign: "center", fontWeight: "700" }}>{err}</Text>}

        {PLANS.map((p) => {
          const isCurrent = user?.plan === p.id;
          return (
            <View
              key={p.id}
              style={[
                styles.card,
                { backgroundColor: p.color, borderColor: p.accent },
                p.popular && { borderBottomWidth: 6 },
              ]}
              testID={`plan-${p.id}`}
            >
              {p.popular && (
                <View style={[styles.tag, { backgroundColor: p.accent }]}>
                  <Text style={styles.tagText}>MOST POPULAR</Text>
                </View>
              )}
              <Text style={[styles.planName, { color: p.textColor }]}>{p.name}</Text>
              <Text style={[styles.price, { color: p.accent }]}>{p.price}</Text>
              <Text style={[styles.period, { color: p.textColor, opacity: 0.6 }]}>{p.period}</Text>
              <View style={{ gap: 8, marginTop: spacing.md }}>
                {p.features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={18} color={p.accent} />
                    <Text style={{ color: p.textColor, fontWeight: "600", flex: 1 }}>{f}</Text>
                  </View>
                ))}
              </View>
              <PButton
                title={isCurrent ? "Current plan" : `Choose ${p.name}`}
                onPress={() => select(p.id)}
                disabled={isCurrent}
                loading={upgrading === p.id}
                variant={p.id === "pro" ? "success" : "primary"}
                style={{ marginTop: spacing.lg }}
                testID={`select-${p.id}`}
              />
            </View>
          );
        })}

        <Text style={styles.disclaimer}>
          In-app purchases are mocked in preview. On real builds, Premium/Pro are billed via Apple App Store
          or Google Play. Cancel anytime in your store settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  header: { alignItems: "center", gap: 4, marginBottom: spacing.md },
  title: { ...typography.h1, fontSize: 28, textAlign: "center" },
  sub: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  card: {
    borderRadius: radius.xl, padding: spacing.lg,
    borderWidth: 2, borderBottomWidth: 4,
  },
  tag: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 8 },
  tagText: { color: "#fff", fontWeight: "800", letterSpacing: 1, fontSize: 11 },
  planName: { fontWeight: "800", fontSize: 24 },
  price: { fontWeight: "800", fontSize: 32, marginTop: 4 },
  period: { fontSize: 13, fontWeight: "600" },
  featureRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  disclaimer: { ...typography.caption, fontSize: 11, textAlign: "center", color: colors.textTertiary, marginTop: spacing.md },
});
