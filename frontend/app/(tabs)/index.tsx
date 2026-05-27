// Dashboard: greeting, streak, XP, exam categories, daily challenge.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, DISCLAIMER, IMAGES, radius, spacing, typography } from "@/src/theme";

type Category = {
  id: string; name: string; short_name: string; description: string;
  icon: string; color: string; total_questions_in_exam: number;
  time_limit_minutes: number; question_bank_size: number;
};

export default function Home() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ categories: Category[] }>("/exams/categories", { auth: false });
      setCats(r.categories);
    } catch {}
    await refresh();
  }, [refresh]);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} testID="home-screen" edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>G'day{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!</Text>
            <Text style={styles.sub}>Let's smash today's study goal.</Text>
          </View>
          <Image source={{ uri: IMAGES.mascot }} style={styles.avatar} resizeMode="contain" />
        </View>

        <View style={styles.statRow}>
          <Stat icon="flame" color={colors.fire} value={`${user?.streak_days ?? 0}`} label="Day Streak" testID="stat-streak" />
          <Stat icon="flash" color={colors.primary} value={`${user?.xp ?? 0}`} label="XP" testID="stat-xp" />
          <Stat icon="ribbon" color={colors.premium} value={`Lv ${user?.level ?? 1}`} label="Level" testID="stat-level" />
        </View>

        <View style={styles.dailyCard} testID="daily-challenge-card">
          <Image source={{ uri: IMAGES.badge }} style={styles.dailyBadge} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.dailyTitle}>Daily Challenge</Text>
            <Text style={styles.dailySub}>Try a quick 10-question quiz to keep your streak alive.</Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/exam/[category]", params: { category: "dkt" } })}
              style={styles.dailyBtn}
              testID="daily-challenge-start"
            >
              <Text style={styles.dailyBtnText}>Start now</Text>
              <Ionicons name="arrow-forward" size={18} color="#0A2A33" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose your exam</Text>
        {loading && <Text style={styles.subtle}>Loading…</Text>}
        {cats.map((c) => (
          <TouchableOpacity
            key={c.id}
            testID={`exam-card-${c.id}`}
            activeOpacity={0.85}
            style={[styles.examCard, { borderBottomColor: c.color }]}
            onPress={() => router.push({ pathname: "/exam/[category]", params: { category: c.id } })}
          >
            <View style={[styles.iconBubble, { backgroundColor: c.color + "22" }]}>
              <Ionicons name={c.icon as any} size={30} color={c.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.examName}>{c.name}</Text>
              <Text style={styles.examMeta} numberOfLines={2}>{c.description}</Text>
              <Text style={styles.examChips}>
                {c.total_questions_in_exam} Qs · {c.time_limit_minutes} min · {c.question_bank_size} in bank
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, color, value, label, testID }: {
  icon: any; color: string; value: string; label: string; testID?: string;
}) {
  return (
    <View style={styles.statCard} testID={testID}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  greeting: { ...typography.h1, fontSize: 26 },
  sub: { ...typography.body, color: colors.textSecondary },
  avatar: { width: 70, height: 70 },
  statRow: { flexDirection: "row", gap: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 4,
    padding: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  statIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  statValue: { ...typography.h3, fontSize: 20 },
  statLabel: { ...typography.caption, fontSize: 12 },
  dailyCard: {
    flexDirection: "row",
    backgroundColor: "#0A2A33",
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: "center",
    borderBottomWidth: 4,
    borderBottomColor: colors.primaryDark,
  },
  dailyBadge: { width: 70, height: 70 },
  dailyTitle: { ...typography.h3, color: colors.primaryGreen, fontSize: 18 },
  dailySub: { color: "#A5C7D0", fontSize: 13, marginTop: 2, marginBottom: 10 },
  dailyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md,
    flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start",
  },
  dailyBtnText: { color: "#0A2A33", fontWeight: "800", letterSpacing: 0.5 },
  sectionTitle: { ...typography.h2, fontSize: 22, marginTop: 4 },
  subtle: { color: colors.textSecondary },
  examCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 4,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.md,
  },
  iconBubble: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  examName: { ...typography.bodyLarge, fontSize: 17 },
  examMeta: { ...typography.caption, marginTop: 2 },
  examChips: { ...typography.caption, color: colors.primaryDark, fontWeight: "700", marginTop: 4 },
  disclaimer: { ...typography.caption, fontSize: 11, color: colors.textTertiary, textAlign: "center", marginTop: spacing.lg },
});
