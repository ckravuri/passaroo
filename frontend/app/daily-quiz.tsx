// Daily Quiz — 10 questions, instant feedback, awards XP once per day.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
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

type Resp = {
  questions: Q[];
  title: string;
  subtitle: string;
  date: string;
};

export default function DailyQuiz() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [result, setResult] = useState<{
    correct: number; total: number; xp_gained: number; already_completed: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<Resp>("/exams/daily-quiz");
        setData(r);
        setAnswers(new Array(r.questions.length).fill(-1));
        setRevealed(new Array(r.questions.length).fill(false));
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="alert-circle" size={60} color={colors.wrong} />
        <Text style={[typography.h3, { textAlign: "center", marginTop: 12 }]}>{error}</Text>
        <PButton title="Go Back" onPress={() => router.back()} variant="secondary" style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ marginTop: 12, color: colors.textSecondary }}>Loading today's quiz…</Text>
      </SafeAreaView>
    );
  }

  if (result) {
    const pct = Math.round((result.correct / result.total) * 100);
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.resultScroll}>
          <Ionicons
            name={pct >= 70 ? "trophy" : "sparkles"}
            size={80}
            color={pct >= 70 ? colors.fire : colors.primary}
          />
          <Text style={styles.resultH1}>{pct >= 70 ? "Smashed it!" : "Nice try!"}</Text>
          <Text style={styles.resultScore}>{result.correct} / {result.total} correct</Text>
          {result.already_completed ? (
            <Text style={styles.resultNote}>You already finished today's quiz — come back tomorrow for fresh XP.</Text>
          ) : (
            <View style={styles.xpPill}>
              <Ionicons name="flash" size={18} color="#0A2A33" />
              <Text style={styles.xpText}>+{result.xp_gained} XP earned</Text>
            </View>
          )}
          <PButton title="Back to Home" onPress={() => router.replace("/(tabs)")} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />
          <PButton title="Review answers" variant="secondary" onPress={() => setResult(null)} style={{ marginTop: spacing.sm, alignSelf: "stretch" }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const total = data.questions.length;
  const q = data.questions[idx];
  const selected = answers[idx];
  const isRevealed = revealed[idx];
  const progress = (idx + 1) / total;

  const pick = (i: number) => {
    if (isRevealed) return;
    setAnswers((a) => { const cp = [...a]; cp[idx] = i; return cp; });
  };

  const reveal = () => {
    setRevealed((r) => { const cp = [...r]; cp[idx] = true; return cp; });
  };

  const next = () => {
    if (idx < total - 1) setIdx(idx + 1);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await api<typeof result>("/exams/daily-quiz/submit", {
        method: "POST",
        body: { question_ids: data.questions.map((x) => x.question_id), answers },
      });
      setResult(r);
      await refresh();
    } catch {
      setSubmitting(false);
    }
  };

  const allAnswered = answers.every((a) => a !== -1);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="daily-quiz-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.dayPill}>
          <Ionicons name="flame" size={14} color={colors.fire} />
          <Text style={styles.dayPillText}>Daily</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.qNum}>Question {idx + 1} of {total}</Text>
        <Text style={styles.qTopic}>{q.topic.toUpperCase()}</Text>
        <Text style={styles.qText}>{q.question}</Text>

        {q.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = isRevealed && i === q.correct;
          const isWrong = isRevealed && isSelected && i !== q.correct;
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.85}
              onPress={() => pick(i)}
              disabled={isRevealed}
              style={[
                styles.option,
                isSelected && !isRevealed && styles.optionSelected,
                isCorrect && styles.optionCorrect,
                isWrong && styles.optionWrong,
              ]}
            >
              <View style={[
                styles.bullet,
                isSelected && !isRevealed && styles.bulletSelected,
                isCorrect && styles.bulletCorrect,
                isWrong && styles.bulletWrong,
              ]}>
                <Text style={[styles.bulletText, (isSelected && !isRevealed) || isCorrect || isWrong ? { color: "#fff" } : {}]}>
                  {isCorrect ? "✓" : isWrong ? "✕" : String.fromCharCode(65 + i)}
                </Text>
              </View>
              <Text style={styles.optionText}>{opt}</Text>
            </TouchableOpacity>
          );
        })}

        {isRevealed && q.explanation && (
          <View style={styles.explainBox}>
            <Text style={styles.explainTitle}>Why?</Text>
            <Text style={styles.explainText}>{q.explanation}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!isRevealed ? (
          <PButton
            title="Check answer"
            onPress={reveal}
            disabled={selected < 0}
            style={{ flex: 1 }}
          />
        ) : idx < total - 1 ? (
          <PButton title="Next question" onPress={next} variant="success" style={{ flex: 1 }} />
        ) : (
          <PButton
            title="Finish quiz"
            variant="success"
            onPress={submit}
            disabled={!allAnswered}
            loading={submitting}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: spacing.md, borderBottomWidth: 2, borderBottomColor: colors.border,
  },
  progressTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.bgAlt, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.fire, borderRadius: 7 },
  dayPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#FFE8D1", borderRadius: 999,
  },
  dayPillText: { color: colors.fire, fontWeight: "800", fontSize: 12 },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 100 },
  qNum: { color: colors.textSecondary, fontWeight: "700" },
  qTopic: { color: colors.primaryDark, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  qText: { ...typography.h3, fontSize: 20, marginVertical: spacing.md, lineHeight: 28 },
  option: {
    flexDirection: "row", gap: 12, alignItems: "center",
    padding: spacing.md, backgroundColor: "#fff", borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, marginBottom: spacing.sm,
  },
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
  footer: {
    flexDirection: "row", gap: 12, padding: spacing.md,
    borderTopWidth: 2, borderTopColor: colors.border, backgroundColor: "#fff",
  },
  resultScroll: { padding: spacing.lg, alignItems: "center", gap: spacing.sm, paddingTop: spacing.xxl },
  resultH1: { ...typography.h1, fontSize: 28, marginTop: spacing.md },
  resultScore: { ...typography.h3, color: colors.primaryDark, marginTop: 4 },
  resultNote: { ...typography.caption, textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.md },
  xpPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.primaryGreen,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, marginTop: spacing.md,
  },
  xpText: { color: "#0A2D1F", fontWeight: "800", letterSpacing: 0.5 },
});
