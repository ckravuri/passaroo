// Bookmarks list — questions the user has bookmarked.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, radius, spacing, typography } from "@/src/theme";

type Q = { question_id: string; question: string; options: string[]; topic: string; explanation?: string; correct: number };

export default function Bookmarks() {
  const router = useRouter();
  const [cards, setCards] = useState<Q[]>([]);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await api<{ bookmarks: Q[] }>("/bookmarks");
      setCards(r.bookmarks);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (qid: string) => {
    await api(`/bookmarks/${qid}`, { method: "POST" });
    setCards((c) => c.filter((x) => x.question_id !== qid));
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="bookmarks-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.h1}>Bookmarks</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && <Text style={styles.subtle}>Loading…</Text>}
        {!loading && cards.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={70} color={colors.textTertiary} />
            <Text style={typography.h3}>No bookmarks yet</Text>
            <Text style={styles.subtle}>Tap the bookmark icon on any question during an exam.</Text>
          </View>
        )}
        {cards.map((q) => {
          const showAns = revealed[q.question_id];
          return (
            <View key={q.question_id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.topic}>{q.topic}</Text>
                <TouchableOpacity onPress={() => remove(q.question_id)}>
                  <Ionicons name="bookmark" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.question}>{q.question}</Text>
              {q.options.map((o, i) => (
                <Text key={i} style={[styles.opt, showAns && i === q.correct && styles.optCorrect]}>
                  {String.fromCharCode(65 + i)}. {o}
                </Text>
              ))}
              <TouchableOpacity onPress={() => setRevealed((r) => ({ ...r, [q.question_id]: !showAns }))}>
                <Text style={styles.reveal}>{showAns ? "Hide answer" : "Show answer"}</Text>
              </TouchableOpacity>
              {showAns && q.explanation && <Text style={styles.explain}>{q.explanation}</Text>}
            </View>
          );
        })}
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
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, gap: 6, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topic: { color: colors.primaryDark, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  question: { ...typography.bodyLarge, fontSize: 15 },
  opt: { paddingVertical: 6, color: colors.textPrimary, fontWeight: "600", fontSize: 14 },
  optCorrect: { color: colors.correct, fontWeight: "800" },
  reveal: { color: colors.primaryDark, fontWeight: "700", marginTop: 4 },
  explain: { fontStyle: "italic", color: colors.textSecondary, fontSize: 13 },
});
