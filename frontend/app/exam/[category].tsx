// Exam in progress — timed multiple-choice with progress bar.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PButton } from "@/src/components/PButton";
import { colors, radius, spacing, typography } from "@/src/theme";

type Q = { question_id: string; question: string; options: string[]; topic: string; difficulty: string };
type Resp = {
  category: { id: string; name: string; short_name: string; time_limit_minutes: number; pass_score_percent: number };
  questions: Q[];
  exams_used_this_week: number;
  exams_per_week_limit: number;
};

export default function ExamRunner() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    (async () => {
      try {
        const r = await api<Resp>(`/exams/${category}/questions`);
        setData(r);
        setAnswers(new Array(r.questions.length).fill(-1));
        setTimeLeft(r.category.time_limit_minutes * 60);
        startedAt.current = Date.now();
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [category]);

  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => setTimeLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [data]);

  useEffect(() => {
    if (data && timeLeft === 0) {
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const q = data?.questions[idx];
  const progress = useMemo(() => (data ? (idx + 1) / data.questions.length : 0), [data, idx]);
  const [bookmarked, setBookmarked] = useState<Record<string, boolean>>({});

  const toggleBookmark = async () => {
    if (!q) return;
    try {
      const r = await api<{ bookmarked: boolean }>(`/bookmarks/${q.question_id}`, { method: "POST" });
      setBookmarked((b) => ({ ...b, [q.question_id]: r.bookmarked }));
    } catch {}
  };

  const pick = (i: number) => {
    setAnswers((a) => {
      const cp = [...a];
      cp[idx] = i;
      return cp;
    });
  };

  const submit = async () => {
    if (!data || submitting) return;
    setSubmitting(true);
    try {
      const r = await api<any>("/exams/attempts", {
        method: "POST",
        body: {
          category_id: data.category.id,
          question_ids: data.questions.map((x) => x.question_id),
          answers,
          time_taken_seconds: Math.round((Date.now() - startedAt.current) / 1000),
        },
      });
      router.replace({
        pathname: "/exam/results",
        params: { payload: encodeURIComponent(JSON.stringify(r)), category: data.category.id },
      });
    } catch (e: any) {
      Alert.alert("Submission failed", e.message);
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="alert-circle" size={60} color={colors.wrong} />
        <Text style={[typography.h3, { textAlign: "center", marginTop: 12 }]}>{error}</Text>
        <PButton title="Go Back" onPress={() => router.back()} variant="secondary" style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }
  if (!data || !q) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ marginTop: 12, color: colors.textSecondary }}>Loading exam…</Text>
      </SafeAreaView>
    );
  }

  const total = data.questions.length;
  const selected = answers[idx];
  const mins = Math.floor(timeLeft / 60);
  const secs = (timeLeft % 60).toString().padStart(2, "0");

  return (
    <SafeAreaView style={styles.container} testID="exam-runner">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="exam-close">
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.timer} testID="exam-timer">
          <Ionicons name="time" size={16} color={timeLeft < 60 ? colors.wrong : colors.primaryDark} />
          <Text style={[styles.timerText, timeLeft < 60 && { color: colors.wrong }]}>
            {mins}:{secs}
          </Text>
        </View>
        <TouchableOpacity onPress={toggleBookmark} testID="exam-bookmark">
          <Ionicons
            name={bookmarked[q.question_id] ? "bookmark" : "bookmark-outline"}
            size={24}
            color={bookmarked[q.question_id] ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.qNum}>Question {idx + 1} of {total}</Text>
        <Text style={styles.qTopic}>{q.topic.toUpperCase()}</Text>
        <Text style={styles.qText} testID="exam-question">{q.question}</Text>

        {q.options.map((opt, i) => {
          const isSelected = selected === i;
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.85}
              testID={`exam-option-${i}`}
              onPress={() => pick(i)}
              style={[styles.option, isSelected && styles.optionSelected]}
            >
              <View style={[styles.bullet, isSelected && styles.bulletSelected]}>
                <Text style={[styles.bulletText, isSelected && { color: "#fff" }]}>
                  {String.fromCharCode(65 + i)}
                </Text>
              </View>
              <Text style={[styles.optionText, isSelected && { color: colors.primaryDark }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <PButton
          title="Back"
          variant="secondary"
          onPress={() => setIdx((v) => Math.max(0, v - 1))}
          style={{ flex: 1 }}
          disabled={idx === 0}
          testID="exam-back"
        />
        {idx < total - 1 ? (
          <PButton
            title="Next"
            onPress={() => setIdx((v) => Math.min(total - 1, v + 1))}
            style={{ flex: 1 }}
            disabled={selected < 0}
            testID="exam-next"
          />
        ) : (
          <PButton
            title="Submit"
            variant="success"
            onPress={submit}
            loading={submitting}
            style={{ flex: 1 }}
            testID="exam-submit"
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
  progressFill: { height: "100%", backgroundColor: colors.primaryGreen, borderRadius: 7 },
  timer: {
    flexDirection: "row", gap: 4, alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.bgAlt, borderRadius: 999,
  },
  timerText: { color: colors.primaryDark, fontWeight: "800" },
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
  bullet: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgAlt,
    alignItems: "center", justifyContent: "center",
  },
  bulletSelected: { backgroundColor: colors.primary },
  bulletText: { fontWeight: "800", color: colors.textPrimary },
  optionText: { flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: "600", lineHeight: 21 },
  footer: {
    flexDirection: "row", gap: 12, padding: spacing.md,
    borderTopWidth: 2, borderTopColor: colors.border, backgroundColor: "#fff",
  },
});
