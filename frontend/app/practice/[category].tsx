// Practice mode — pick a topic, get 10 self-paced questions with instant feedback.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PButton } from "@/src/components/PButton";
import { colors, radius, spacing, typography } from "@/src/theme";

type Topic = { topic: string; count: number; states: string[] };
type Q = {
  question_id: string;
  question: string;
  options: string[];
  correct: number;
  topic: string;
  explanation?: string;
};

export default function Practice() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number>(-1);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ topics: Topic[] }>(`/exams/${category}/topics`, { auth: false });
        setTopics(r.topics);
      } catch {}
      setLoading(false);
    })();
  }, [category]);

  const startTopic = async (topic: string | null) => {
    setLoading(true);
    setSelectedTopic(topic);
    try {
      const path = topic
        ? `/exams/${category}/practice?topic=${encodeURIComponent(topic)}&count=10`
        : `/exams/${category}/practice?count=10`;
      const r = await api<{ questions: Q[] }>(path);
      setQuestions(r.questions);
      setIdx(0); setSelected(-1); setRevealed(false); setCorrectCount(0); setDone(false);
    } catch {}
    setLoading(false);
  };

  if (loading && !questions) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  // Topic picker
  if (!questions) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]} testID="practice-picker">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.h1}>Practice</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.intro}>Pick a topic to practise. Each round is 10 questions with instant answers.</Text>

          <TouchableOpacity style={[styles.topicCard, styles.topicAll]} onPress={() => startTopic(null)} testID="practice-topic-all">
            <View style={[styles.topicIcon, { backgroundColor: "#FFFFFF22" }]}>
              <Ionicons name="shuffle" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.topicName, { color: "#fff" }]}>Mixed topics</Text>
              <Text style={[styles.topicMeta, { color: "#D6F4FB" }]}>Random questions from the whole bank</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </TouchableOpacity>

          {topics.map((t) => (
            <TouchableOpacity
              key={t.topic}
              style={styles.topicCard}
              onPress={() => startTopic(t.topic)}
              testID={`practice-topic-${t.topic}`}
            >
              <View style={styles.topicIcon}>
                <Ionicons name="library" size={22} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.topicName}>{t.topic}</Text>
                <Text style={styles.topicMeta}>{t.count} question{t.count === 1 ? "" : "s"}{t.states.length > 0 ? ` · ${t.states.join(", ")}` : ""}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}

          {topics.length === 0 && !loading && (
            <Text style={styles.subtle}>No topics found for this category.</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Result screen
  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100);
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.resultScroll}>
          <Ionicons name={pct >= 70 ? "trophy" : "thumbs-up"} size={80} color={pct >= 70 ? colors.correct : colors.primary} />
          <Text style={styles.resultH1}>{pct >= 70 ? "Great work!" : "Keep practising!"}</Text>
          <Text style={styles.resultScore}>{correctCount} / {questions.length}</Text>
          <Text style={styles.subtle}>{selectedTopic ?? "Mixed topics"}</Text>
          <PButton title="Try another round" onPress={() => { setQuestions(null); }} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />
          <PButton title="Back to Home" variant="secondary" onPress={() => router.replace("/(tabs)")} style={{ marginTop: spacing.sm, alignSelf: "stretch" }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Question runner
  const total = questions.length;
  const q = questions[idx];
  const progress = (idx + 1) / total;

  const pick = (i: number) => { if (!revealed) setSelected(i); };
  const check = () => {
    setRevealed(true);
    if (selected === q.correct) setCorrectCount((c) => c + 1);
  };
  const next = () => {
    if (idx < total - 1) {
      setIdx(idx + 1); setSelected(-1); setRevealed(false);
    } else {
      setDone(true);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="practice-runner">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setQuestions(null)}>
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.scorePill}>
          <Ionicons name="checkmark-circle" size={14} color={colors.correct} />
          <Text style={styles.scorePillText}>{correctCount}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.qScroll}>
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
              onPress={() => pick(i)}
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
          <PButton title={idx < total - 1 ? "Next question" : "Finish"} variant="success" onPress={next} style={{ flex: 1 }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: spacing.md, borderBottomWidth: 2, borderBottomColor: colors.border,
  },
  h1: { ...typography.h2, fontSize: 22 },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 60 },
  intro: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  topicCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    backgroundColor: "#fff", borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, marginBottom: spacing.sm,
  },
  topicAll: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  topicIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgAlt, alignItems: "center", justifyContent: "center" },
  topicName: { fontWeight: "800", fontSize: 16, color: colors.textPrimary },
  topicMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  subtle: { color: colors.textSecondary, textAlign: "center", marginTop: spacing.lg },
  progressTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.bgAlt, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primaryGreen, borderRadius: 7 },
  scorePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.bgAlt, borderRadius: 999 },
  scorePillText: { fontWeight: "800", color: colors.primaryDark },
  qScroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 100 },
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
  footer: { flexDirection: "row", gap: 12, padding: spacing.md, borderTopWidth: 2, borderTopColor: colors.border, backgroundColor: "#fff" },
  resultScroll: { padding: spacing.lg, alignItems: "center", gap: spacing.sm, paddingTop: spacing.xxl },
  resultH1: { ...typography.h1, fontSize: 28, marginTop: spacing.md },
  resultScore: { ...typography.h2, color: colors.primaryDark },
});
