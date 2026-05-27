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

  const primaryCat = user?.primary_category_id || (user?.state ? `dkt_${user.state.toLowerCase()}` : "dkt_nsw");
  const primaryCatInfo = cats.find((c) => c.id === primaryCat);
  const featured = primaryCatInfo
    ? [primaryCatInfo, ...cats.filter((c) => c.id !== primaryCat)]
    : cats;

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
            {user?.state && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/select-state", params: { from: "settings" } })}
                style={styles.statePill}
                testID="state-pill"
              >
                <Ionicons name="location" size={12} color={colors.primaryDark} />
                <Text style={styles.statePillText}>{user.state}</Text>
                <Ionicons name="chevron-down" size={12} color={colors.primaryDark} />
              </TouchableOpacity>
            )}
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
              onPress={() => router.push("/daily-quiz")}
              style={styles.dailyBtn}
              testID="daily-challenge-start"
            >
              <Text style={styles.dailyBtnText}>Start now</Text>
              <Ionicons name="arrow-forward" size={18} color="#0A2A33" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickGrid}>
          <QuickTile icon="library" label="Practice" color={colors.primary} onPress={() => router.push({ pathname: "/practice/[category]", params: { category: primaryCat } })} testID="quick-practice" />
          <QuickTile icon="refresh" label="Retry Wrong" color={colors.wrong} onPress={() => router.push("/retry-wrong")} testID="quick-retry" />
          <QuickTile icon="book" label="Reading" color={colors.primaryDark} onPress={() => router.push({ pathname: "/reading/[category]", params: { category: primaryCat } })} testID="quick-reading" />
          <QuickTile icon="albums" label="Flashcards" color={colors.premium} onPress={() => router.push("/flashcards")} testID="quick-flashcards" />
          <QuickTile icon="trophy" label="Achievements" color={colors.fire} onPress={() => router.push("/achievements")} testID="quick-achievements" />
          <QuickTile icon="podium" label="Leaderboard" color={colors.correct} onPress={() => router.push("/leaderboard")} testID="quick-leaderboard" />
          <QuickTile icon="calendar" label="Study Plan" color={colors.primaryGreenDark} onPress={() => router.push("/study-plan")} testID="quick-plan" />
          <QuickTile icon="bookmark" label="Bookmarks" color={colors.primary} onPress={() => router.push("/bookmarks")} testID="quick-bookmarks" />
        </View>

        <Text style={styles.sectionTitle}>Choose your exam</Text>
        {loading && <Text style={styles.subtle}>Loading…</Text>}
        {featured.map((c) => (
          <TouchableOpacity
            key={c.id}
            testID={`exam-card-${c.id}`}
            activeOpacity={0.85}
            style={[styles.examCard, { borderBottomColor: c.color }, c.id === primaryCat && styles.examCardFeatured]}
            onPress={() => router.push({ pathname: "/exam/[category]", params: { category: c.id } })}
          >
            <View style={[styles.iconBubble, { backgroundColor: c.color + "22" }]}>
              <Ionicons name={c.icon as any} size={30} color={c.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.examTitleRow}>
                <Text style={styles.examName} numberOfLines={1}>{c.name}</Text>
                {c.id === primaryCat && (
                  <View style={[styles.yoursPill, { backgroundColor: c.color }]}>
                    <Text style={styles.yoursPillText}>Yours</Text>
                  </View>
                )}
              </View>
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

function QuickTile({ icon, label, color, onPress, testID }: {
  icon: any; label: string; color: string; onPress: () => void; testID?: string;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.quickTile} testID={testID}>
      <View style={[styles.quickIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
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
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  statePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.bgAlt,
    borderRadius: 999, alignSelf: "flex-start", marginTop: 6,
  },
  statePillText: { color: colors.primaryDark, fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },
  examCardFeatured: { borderColor: colors.primary, backgroundColor: "#F1FBFD" },
  examTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  yoursPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  yoursPillText: { color: "#0A2A33", fontWeight: "800", fontSize: 10, letterSpacing: 0.5 },
  quickTile: {
    width: "22%",
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 4,
    paddingVertical: spacing.sm,
    alignItems: "center",
    gap: 6,
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  quickLabel: { fontSize: 11, fontWeight: "700", color: colors.textPrimary, textAlign: "center", paddingHorizontal: 2 },
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
