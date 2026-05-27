// Leaderboard — top 20 + your rank.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, IMAGES, radius, spacing, typography } from "@/src/theme";

type L = { user_id: string; name: string; xp: number; level: number; streak_days: number; picture?: string | null; is_self: boolean };

export default function Leaderboard() {
  const router = useRouter();
  const [data, setData] = useState<{ leaders: L[]; my_rank: number; my_xp: number } | null>(null);

  useEffect(() => {
    (async () => { try { setData(await api("/leaderboard")); } catch {} })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="leaderboard-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.h1}>Leaderboard</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {data && (
          <View style={styles.rankCard}>
            <Text style={styles.rankLabel}>Your rank</Text>
            <Text style={styles.rankValue}>#{data.my_rank}</Text>
            <Text style={styles.rankXp}>{data.my_xp} XP</Text>
          </View>
        )}
        {data?.leaders.map((u, i) => (
          <View
            key={u.user_id}
            style={[styles.row, u.is_self && styles.selfRow]}
            testID={`leader-${i}`}
          >
            <Text style={[styles.rank, i < 3 && { color: ["#FFD700", "#C0C0C0", "#CD7F32"][i] }]}>
              {i + 1}
            </Text>
            {u.picture ? (
              <Image source={{ uri: u.picture }} style={styles.avatar} />
            ) : (
              <Image source={{ uri: IMAGES.mascot }} style={styles.avatar} resizeMode="contain" />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{u.name}{u.is_self ? "  (you)" : ""}</Text>
              <Text style={styles.meta}>Lv {u.level} · 🔥 {u.streak_days}d</Text>
            </View>
            <Text style={styles.xp}>{u.xp} XP</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", padding: spacing.md, alignItems: "center", gap: 12, borderBottomWidth: 2, borderBottomColor: colors.border },
  h1: { ...typography.h2, fontSize: 22 },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 60 },
  rankCard: {
    backgroundColor: "#0A2A33", borderRadius: radius.xl, padding: spacing.md, alignItems: "center",
    borderBottomWidth: 4, borderBottomColor: colors.primaryDark, marginBottom: spacing.md,
  },
  rankLabel: { color: "#A5C7D0", fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  rankValue: { color: colors.primaryGreen, fontWeight: "800", fontSize: 36 },
  rankXp: { color: "#fff", fontWeight: "700" },
  row: {
    flexDirection: "row", gap: 12, padding: spacing.md, alignItems: "center",
    backgroundColor: "#fff", borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
  },
  selfRow: { borderColor: colors.primary, backgroundColor: "#F0FAFF" },
  rank: { width: 28, fontWeight: "800", textAlign: "center", color: colors.textSecondary },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  name: { fontWeight: "700", fontSize: 15 },
  meta: { ...typography.caption, fontSize: 12 },
  xp: { fontWeight: "800", color: colors.primaryDark },
});
