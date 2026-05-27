// Retry Wrong — review questions the user previously got wrong, with answers + explanations.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PButton } from "@/src/components/PButton";
import { colors, radius, spacing, typography } from "@/src/theme";

type Q = {
  question_id: string;
  question: string;
  options: string[];
  correct: number;
  topic: string;
  explanation?: string;
};

export default function RetryWrong() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number>(-1);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ questions: Q[]; count: number }>("/exams/retry-wrong");
        setQuestions(r.questions);
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.h1}>Retry Wrong</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="sparkles" size={70} color={colors.primary} />
          <Text style={typography.h3}>No wrong answers yet!</Text>
          <Text style={styles.subtle}>Once you finish a mock exam, any missed questions will appear here for review.</Text>
          <PButton title="Take a mock exam" onPress={() => router.replace("/(tabs)/exams")} style={{ marginTop: spacing.lg, alignSelf: "stretch", marginHorizontal: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100);
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.resultScroll}>
          <Ionicons name={pct >= 70 ? "medal" : "refresh-circle"} size={80} color={pct >= 70 ? colors.fire : colors.primary} />
          <Text style={styles.resultH1}>Review complete</Text>
          <Text style={styles.resultScore}>{correctCount} / {questions.length} correct this time</Text>
          <Text style={styles.subtle}>Keep cycling through these until they all stick.</Text>
          <PButton title="Restart review" onPress={() => { setIdx(0); setSelected(-1); setRevealed(false); setCorrectCount(0); setDone(false); }} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />
          <PButton title="Back to Home" variant="secondary" onPress={() => router.replace("/(tabs)")} style={{ marginTop: spacing.sm, alignSelf: "stretch" }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const q = questions[idx];
  const total = questions.length;
  const progress = (idx + 1) / total;

  const check = () => {
    setRevealed(true);
    if (selected === q.correct) setCorrectCount((c) => c + 1);
  };
  const next = () => {
    if (idx < total - 1) { setIdx(idx + 1); setSelected(-1); setRevealed(false); }
    else setDone(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="retry-wrong-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.tagPill}>
          <Ionicons name="refresh" size={14} color={colors.wrong} />
          <Text style={styles.tagPillText}>Retry</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.qNum}>Question {idx + 1} of {total}</Text>
        <Text style={styles.qTopic}>{q.topic.toUpperCase()}</Text>
        <Text style={styles.qText}>{q.question}</Text>
        {q.options.map((opt, i) => {
          const isSel = selected === i;
          const isCor = revealed && i === q.correct;
          const isWro = revealed && isSel && i !== q.correct;
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.85}
              onPress={() => !revealed && setSelected(i)}
              disabled={revealed}
              style={[styles.option, isSel && !revealed && styles.optionSelected, isCor && styles.optionCorrect, isWro && styles.optionWrong]}
            >
              <View style={[styles.bullet, isSel && !revealed && styles.bulletSelected, isCor && styles.bulletCorrect, isWro && styles.bulletWrong]}>
                <Text style={[styles.bulletText, (isSel && !revealed) || isCor || isWro ? { color: "#fff" } : {}]}>
                  {isCor ? "✓" : isWro ? "✕" : String.fromCharCode(65 + i)}
                </Text>
              </View>
              <Text style={styles.optionText}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
        {revealed && q.explanation && (
          <View style={styles.explainBox}>
            <Text style={styles.explainTitle}>Why?</Text>
            <Text style={styles.explainText}>{q.explanation}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!revealed ? (
          <PButton title="Check answer" onPress={check} disabled={selected < 0} style={{ flex: 1 }} />
        ) : (
          <PButton title={idx < total - 1 ? "Next" : "Finish review"} variant="success" onPress={next} style={{ flex: 1 }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md, borderBottomWidth: 2, borderBottomColor: colors.border },
  h1: { ...typography.h2, fontSize: 22 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.sm },
  subtle: { color: colors.textSecondary, textAlign: "center", paddingHorizontal: spacing.md },
  progressTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.bgAlt, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.wrong, borderRadius: 7 },
  tagPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#FFE8E8", borderRadius: 999 },
  tagPillText: { color: colors.wrong, fontWeight: "800", fontSize: 12 },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 100 },
  qNum: { color: colors.textSecondary, fontWeight: "700" },
  qTopic: { color: colors.primaryDark, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  qText: { ...typography.h3, fontSize: 20, marginVertical: spacing.md, lineHeight: 28 },
  option: { flexDirection: "row", gap: 12, alignItems: "center", padding: spacing.md, backgroundColor: "#fff", borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, marginBottom: spacing.sm },
  optionSelected: { borderColor: colors.primary, backgroundColor: "#E6FAFF" },
  optionCorrect: { borderColor: colors.correct, backgroundColor: "#EAFBE0" },
  optionWrong: { borderColor: colors.wrong, backgroundColor: "#FFE8E8" },
  bullet: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgAlt, alignItems: "center", justifyContent: "center" },
  bulletSelected: { backgroundColor: colors.primary },
  bulletCorrect: { backgroundColor: colors.correct },
  bulletWrong: { backgroundColor: colors.wrong },
  bulletText: { fontWeight: "800", color: colors.textPrimary },
  optionText: { flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: "600", lineHeight: 21 },
  explainBox: { backgroundColor: "#FFF6E8", borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.sm, borderWidth: 2, borderColor: "#FFD48A" },
  explainTitle: { fontWeight: "800", color: colors.fire, marginBottom: 4 },
  explainText: { color: colors.textPrimary, lineHeight: 20, fontSize: 14 },
  footer: { flexDirection: "row", gap: 12, padding: spacing.md, borderTopWidth: 2, borderTopColor: colors.border, backgroundColor: "#fff" },
  resultScroll: { padding: spacing.lg, alignItems: "center", gap: spacing.sm, paddingTop: spacing.xxl },
  resultH1: { ...typography.h1, fontSize: 28, marginTop: spacing.md },
  resultScore: { ...typography.h2, color: colors.primaryDark },
});
