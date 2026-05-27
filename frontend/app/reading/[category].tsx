// Reading material per category.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, DISCLAIMER, radius, spacing, typography } from "@/src/theme";

type Chapter = { title: string; summary: string; key_points: string[] };
type Data = { category_id: string; chapters: Chapter[] };

export default function Reading() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      try { setData(await api(`/reading/${category}`, { auth: false })); } catch {}
    })();
  }, [category]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="reading-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.h1}>Reading Material</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {!data && <Text style={styles.subtle}>Loading…</Text>}
        {data?.chapters.map((c, i) => (
          <View key={i} style={styles.card} testID={`chapter-${i}`}>
            <View style={styles.chip}>
              <Ionicons name="book" size={14} color={colors.primaryDark} />
              <Text style={styles.chipText}>Chapter {i + 1}</Text>
            </View>
            <Text style={styles.title}>{c.title}</Text>
            <Text style={styles.summary}>{c.summary}</Text>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              {c.key_points.map((p, j) => (
                <View key={j} style={styles.kp}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.correct} />
                  <Text style={styles.kpText}>{p}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", padding: spacing.md, alignItems: "center", gap: 12, borderBottomWidth: 2, borderBottomColor: colors.border },
  h1: { ...typography.h2, fontSize: 22 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  subtle: { color: colors.textSecondary, textAlign: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, gap: 4, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4 },
  chip: { flexDirection: "row", gap: 4, alignSelf: "flex-start", backgroundColor: "#E6FAFF", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignItems: "center" },
  chipText: { color: colors.primaryDark, fontWeight: "800", fontSize: 12 },
  title: { ...typography.h3, fontSize: 18 },
  summary: { color: colors.textSecondary, lineHeight: 20 },
  kp: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  kpText: { flex: 1, color: colors.textPrimary, fontWeight: "500", lineHeight: 19, fontSize: 14 },
  disclaimer: { ...typography.caption, fontSize: 11, textAlign: "center", color: colors.textTertiary, marginTop: spacing.md },
});
