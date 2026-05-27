// Analytics tab — stats and weak topics.
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, IMAGES, radius, spacing, typography } from "@/src/theme";

type Stats = {
  user: { plan: string; streak_days: number; xp: number; level: number; exams_this_week: number };
  limits: { exams_per_week: number };
  by_category: Record<string, { attempts: number; best_score: number; avg_score: number; passed: number }>;
  weak_topics_top: [string, number][];
  total_attempts: number;
};

const CAT_NAMES: Record<string, string> = {
  dkt: "DKT", citizenship: "Citizenship", rsa: "RSA",
};

export default function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Stats>("/user/stats");
      setStats(r);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="analytics-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.h1}>Your Stats</Text>

        {!stats && <Text style={styles.subtle}>Loading…</Text>}

        {stats && (
          <>
            <View style={styles.heroCard}>
              <Image source={{ uri: IMAGES.badge }} style={{ width: 80, height: 80 }} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>Level {stats.user.level}</Text>
                <Text style={styles.heroSub}>{stats.user.xp} XP · {stats.user.streak_days} day streak</Text>
                <Text style={styles.heroPlan}>
                  Plan: {stats.user.plan.toUpperCase()} · {stats.user.exams_this_week}/{stats.limits.exams_per_week} exams this week
                </Text>
              </View>
            </View>

            <Text style={styles.section}>By Category</Text>
            {Object.entries(stats.by_category).length === 0 ? (
              <Text style={styles.subtle}>Take an exam to see your stats here.</Text>
            ) : (
              Object.entries(stats.by_category).map(([cat, s]) => (
                <View key={cat} style={styles.catCard} testID={`cat-stats-${cat}`}>
                  <View style={styles.catHeader}>
                    <Text style={styles.catName}>{CAT_NAMES[cat] ?? cat}</Text>
                    <Text style={styles.catAttempts}>{s.attempts} attempts</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${s.avg_score}%` }]} />
                  </View>
                  <View style={styles.row}>
                    <Stat label="Avg" value={`${s.avg_score}%`} />
                    <Stat label="Best" value={`${s.best_score}%`} />
                    <Stat label="Passed" value={`${s.passed}/${s.attempts}`} />
                  </View>
                </View>
              ))
            )}

            <Text style={styles.section}>Weak Topics</Text>
            {stats.weak_topics_top.length === 0 ? (
              <Text style={styles.subtle}>No weaknesses yet — keep going!</Text>
            ) : (
              <View style={styles.weakCard}>
                {stats.weak_topics_top.map(([t, c]) => (
                  <View key={t} style={styles.weakRow} testID={`weak-${t}`}>
                    <Ionicons name="alert-circle" color={colors.wrong} size={18} />
                    <Text style={styles.weakText}>{t}</Text>
                    <Text style={styles.weakCount}>×{c}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  h1: { ...typography.h1, fontSize: 28 },
  subtle: { color: colors.textSecondary },
  heroCard: {
    flexDirection: "row", gap: spacing.md, padding: spacing.md,
    backgroundColor: "#0A2A33", borderRadius: radius.xl,
    borderBottomWidth: 4, borderBottomColor: colors.primaryDark, alignItems: "center",
  },
  heroTitle: { color: colors.primaryGreen, fontWeight: "800", fontSize: 22 },
  heroSub: { color: "#A5C7D0", fontWeight: "600", marginTop: 2 },
  heroPlan: { color: "#fff", fontWeight: "600", marginTop: 8, fontSize: 12, letterSpacing: 0.5 },
  section: { ...typography.h3, marginTop: spacing.md },
  catCard: {
    backgroundColor: "#fff", padding: spacing.md, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, gap: spacing.sm,
  },
  catHeader: { flexDirection: "row", justifyContent: "space-between" },
  catName: { ...typography.bodyLarge },
  catAttempts: { ...typography.caption, color: colors.primaryDark, fontWeight: "700" },
  progressTrack: { height: 14, borderRadius: 7, backgroundColor: colors.bgAlt, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primaryGreen, borderRadius: 7 },
  row: { flexDirection: "row" },
  statValue: { fontWeight: "800", fontSize: 18, color: colors.textPrimary },
  statLabel: { ...typography.caption, fontSize: 11 },
  weakCard: {
    backgroundColor: "#fff", borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, padding: spacing.md, gap: 10,
  },
  weakRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  weakText: { flex: 1, color: colors.textPrimary, fontWeight: "600" },
  weakCount: { color: colors.wrong, fontWeight: "800" },
});
