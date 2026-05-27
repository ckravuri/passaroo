// Achievements grid.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, radius, spacing, typography } from "@/src/theme";

type A = { id: string; title: string; description: string; icon: string; color: string; earned: boolean };

export default function Achievements() {
  const router = useRouter();
  const [data, setData] = useState<{ achievements: A[]; earned_count: number; total: number } | null>(null);

  useEffect(() => {
    (async () => {
      try { setData(await api("/achievements/me")); } catch {}
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="achievements-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.h1}>Achievements</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {data && (
          <Text style={styles.summary}>
            {data.earned_count} of {data.total} unlocked
          </Text>
        )}
        <View style={styles.grid}>
          {data?.achievements.map((a) => (
            <View
              key={a.id}
              style={[styles.card, !a.earned && styles.locked]}
              testID={`achievement-${a.id}`}
            >
              <View style={[styles.iconBubble, { backgroundColor: a.earned ? a.color + "22" : colors.bgAlt }]}>
                <Ionicons name={a.icon as any} size={32} color={a.earned ? a.color : colors.textTertiary} />
              </View>
              <Text style={[styles.title, !a.earned && { color: colors.textTertiary }]} numberOfLines={1}>
                {a.title}
              </Text>
              <Text style={styles.desc} numberOfLines={2}>{a.description}</Text>
              {a.earned && (
                <View style={styles.earnedBadge}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", padding: spacing.md, alignItems: "center", gap: 12, borderBottomWidth: 2, borderBottomColor: colors.border },
  h1: { ...typography.h2, fontSize: 22 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  summary: { ...typography.bodyLarge, color: colors.primaryDark, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  card: {
    width: "48%", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, gap: 6,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, alignItems: "center", position: "relative",
  },
  locked: { opacity: 0.5 },
  iconBubble: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "800", fontSize: 14, textAlign: "center" },
  desc: { fontSize: 11, color: colors.textSecondary, textAlign: "center", lineHeight: 14 },
  earnedBadge: { position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.correct, alignItems: "center", justifyContent: "center" },
});
