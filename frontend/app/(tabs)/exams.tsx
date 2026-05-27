// Exams tab — list of categories with start buttons.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, DISCLAIMER, radius, spacing, typography } from "@/src/theme";

type Cat = {
  id: string; name: string; description: string; icon: string; color: string;
  total_questions_in_exam: number; time_limit_minutes: number; pass_score_percent: number; question_bank_size: number;
};

export default function Exams() {
  const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ categories: Cat[] }>("/exams/categories", { auth: false });
        setCats(r.categories);
      } catch {}
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="exams-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Mock Exams</Text>
        <Text style={styles.sub}>Pick a category and take a timed practice exam.</Text>

        {cats.map((c) => (
          <View key={c.id} style={[styles.card, { borderBottomColor: c.color }]} testID={`exam-row-${c.id}`}>
            <View style={[styles.icon, { backgroundColor: c.color + "22" }]}>
              <Ionicons name={c.icon as any} size={32} color={c.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{c.name}</Text>
              <Text style={styles.meta}>
                {c.total_questions_in_exam} Qs · {c.time_limit_minutes} min · Pass {c.pass_score_percent}%
              </Text>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: c.color }]}
                onPress={() => router.push({ pathname: "/exam/[category]", params: { category: c.id } })}
                testID={`start-exam-${c.id}`}
              >
                <Text style={styles.btnText}>Start exam</Text>
              </TouchableOpacity>
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
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  h1: { ...typography.h1, fontSize: 28 },
  sub: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  card: {
    flexDirection: "row", gap: spacing.md, padding: spacing.md,
    borderRadius: radius.xl, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
    backgroundColor: "#fff",
  },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  title: { ...typography.bodyLarge, fontSize: 17 },
  meta: { ...typography.caption, marginTop: 2, marginBottom: spacing.sm },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.md, alignSelf: "flex-start" },
  btnText: { color: "#0A2A33", fontWeight: "800", letterSpacing: 0.5 },
  disclaimer: { ...typography.caption, fontSize: 11, color: colors.textTertiary, textAlign: "center", marginTop: spacing.lg },
});
