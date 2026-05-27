// Exam results — score, pass probability, review with AI explanations.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PassarooBannerAd } from "@/src/ads/PassarooBannerAd";
import { useExamInterstitialAd } from "@/src/ads/useExamInterstitialAd";
import { PButton } from "@/src/components/PButton";
import { colors, IMAGES, radius, spacing, typography } from "@/src/theme";

type Review = {
  question_id: string; question: string; options: string[];
  correct: number; user_answer: number; is_correct: boolean;
  topic?: string; explanation?: string;
};
type ResultPayload = {
  attempt_id: string;
  score_percent: number; correct_count: number; total_questions: number;
  passed: boolean; pass_probability: number;
  weak_topics: Record<string, number>; xp_gained: number; review: Review[];
};

export default function Results() {
  const router = useRouter();
  const { payload, category } = useLocalSearchParams<{ payload: string; category: string }>();
  const { trigger: triggerInterstitial } = useExamInterstitialAd({ showEveryN: 2 });
  const data: ResultPayload | null = useMemo(() => {
    try {
      return JSON.parse(decodeURIComponent(payload ?? ""));
    } catch {
      return null;
    }
  }, [payload]);

  const [aiTexts, setAiTexts] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const [generatingCards, setGeneratingCards] = useState(false);

  // Trigger interstitial after every 2nd exam submission (free-tier only).
  useEffect(() => {
    if (data) triggerInterstitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.attempt_id]);

  if (!data) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={typography.h3}>Could not load results</Text>
        <PButton title="Go Home" onPress={() => router.replace("/(tabs)")} style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  const explain = async (r: Review) => {
    if (aiTexts[r.question_id] || loadingIds[r.question_id]) return;
    setLoadingIds((l) => ({ ...l, [r.question_id]: true }));
    try {
      const resp = await api<{ explanation: string }>("/ai/explain", {
        method: "POST",
        body: {
          question: r.question,
          options: r.options,
          correct_index: r.correct,
          user_answer_index: r.user_answer,
        },
      });
      setAiTexts((t) => ({ ...t, [r.question_id]: resp.explanation }));
    } catch (e: any) {
      setAiTexts((t) => ({ ...t, [r.question_id]: `⚠️ ${e.message}` }));
    } finally {
      setLoadingIds((l) => ({ ...l, [r.question_id]: false }));
    }
  };

  const generateFlashcards = async () => {
    setGeneratingCards(true);
    try {
      const topics = Object.keys(data.weak_topics);
      await api("/ai/flashcards", {
        method: "POST",
        body: { category_id: category, wrong_topics: topics, count: 5 },
      });
      router.push("/flashcards");
    } catch (e: any) {
      setAiTexts((t) => ({ ...t, _err: e.message }));
    } finally {
      setGeneratingCards(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="results-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.heroCard, { backgroundColor: data.passed ? colors.correct : colors.wrong }]}>
          <Image source={{ uri: IMAGES.badge }} style={{ width: 90, height: 90 }} resizeMode="contain" />
          <Text style={styles.heroTitle}>{data.passed ? "You passed!" : "Keep going!"}</Text>
          <Text style={styles.heroScore} testID="result-score">{data.score_percent}%</Text>
          <Text style={styles.heroSub}>
            {data.correct_count}/{data.total_questions} correct · +{data.xp_gained} XP
          </Text>
        </View>

        <View style={styles.probCard}>
          <Text style={styles.probLabel}>Pass probability</Text>
          <View style={styles.probTrack}>
            <View style={[styles.probFill, { width: `${data.pass_probability}%` }]} />
          </View>
          <Text style={styles.probValue}>{data.pass_probability}%</Text>
        </View>

        {Object.keys(data.weak_topics).length > 0 && (
          <View style={styles.weakCard}>
            <Text style={styles.weakTitle}>Weak topics to revise</Text>
            <View style={styles.weakChips}>
              {Object.entries(data.weak_topics).map(([t, c]) => (
                <View key={t} style={styles.weakChip}>
                  <Text style={styles.weakChipText}>{t} ×{c}</Text>
                </View>
              ))}
            </View>
            <PButton
              title={generatingCards ? "Generating…" : "Make AI Flashcards"}
              loading={generatingCards}
              onPress={generateFlashcards}
              variant="success"
              testID="generate-flashcards"
            />
          </View>
        )}

        <Text style={styles.section}>Review answers</Text>
        {data.review.map((r, i) => (
          <View key={r.question_id} style={styles.reviewCard} testID={`review-${i}`}>
            <View style={styles.reviewHeader}>
              <Ionicons
                name={r.is_correct ? "checkmark-circle" : "close-circle"}
                size={22}
                color={r.is_correct ? colors.correct : colors.wrong}
              />
              <Text style={styles.reviewQ}>{r.question}</Text>
            </View>
            {r.options.map((opt, j) => (
              <View
                key={j}
                style={[
                  styles.reviewOpt,
                  j === r.correct && styles.reviewOptCorrect,
                  j === r.user_answer && j !== r.correct && styles.reviewOptWrong,
                ]}
              >
                <Text style={styles.reviewOptText}>
                  {String.fromCharCode(65 + j)}. {opt}
                </Text>
              </View>
            ))}
            <Text style={styles.reviewExplain}>{r.explanation}</Text>

            {aiTexts[r.question_id] ? (
              <View style={styles.aiBox}>
                <Text style={styles.aiHeader}>🤖 AI Coach</Text>
                <Text style={styles.aiText}>{aiTexts[r.question_id]}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.aiBtn}
                onPress={() => explain(r)}
                disabled={!!loadingIds[r.question_id]}
                testID={`ai-explain-${i}`}
              >
                <Ionicons name="sparkles" size={16} color={colors.primaryDark} />
                <Text style={styles.aiBtnText}>
                  {loadingIds[r.question_id] ? "Thinking…" : "Explain with AI"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <PButton title="Back to Home" onPress={() => router.replace("/(tabs)")} testID="results-home" />
      </ScrollView>
      <PassarooBannerAd placement="results-banner" testID="ad-banner-results" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  heroCard: {
    borderRadius: radius.xxl, padding: spacing.lg, alignItems: "center",
    borderBottomWidth: 4, borderBottomColor: "rgba(0,0,0,0.2)",
  },
  heroTitle: { color: "#fff", fontWeight: "800", fontSize: 22, marginTop: 8 },
  heroScore: { color: "#fff", fontWeight: "800", fontSize: 56, lineHeight: 64 },
  heroSub: { color: "#fff", fontWeight: "700", opacity: 0.95 },
  probCard: {
    backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, gap: 8,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
  },
  probLabel: { ...typography.caption, fontWeight: "700" },
  probTrack: { height: 16, borderRadius: 8, backgroundColor: colors.bgAlt, overflow: "hidden" },
  probFill: { height: "100%", backgroundColor: colors.primaryGreen, borderRadius: 8 },
  probValue: { textAlign: "right", fontWeight: "800", color: colors.primaryDark },
  weakCard: {
    backgroundColor: "#FFF5E6", borderRadius: radius.lg, padding: spacing.md, gap: 12,
    borderWidth: 2, borderColor: colors.fire, borderBottomWidth: 4,
  },
  weakTitle: { fontWeight: "800", color: "#7A4700", fontSize: 16 },
  weakChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  weakChip: { backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.fire },
  weakChipText: { color: "#7A4700", fontWeight: "700", fontSize: 13 },
  section: { ...typography.h3, marginTop: spacing.md },
  reviewCard: {
    backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, gap: 8,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
  },
  reviewHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  reviewQ: { flex: 1, ...typography.bodyLarge, fontSize: 15, lineHeight: 22 },
  reviewOpt: { backgroundColor: colors.bgAlt, padding: 10, borderRadius: radius.md, borderWidth: 2, borderColor: "transparent" },
  reviewOptCorrect: { backgroundColor: "#DFFCDF", borderColor: colors.correct },
  reviewOptWrong: { backgroundColor: "#FFE0E0", borderColor: colors.wrong },
  reviewOptText: { color: colors.textPrimary, fontWeight: "600", fontSize: 14 },
  reviewExplain: { color: colors.textSecondary, fontSize: 13, fontStyle: "italic" },
  aiBox: { backgroundColor: "#F0FAFF", borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.primary },
  aiHeader: { fontWeight: "800", color: colors.primaryDark, marginBottom: 4 },
  aiText: { color: colors.textPrimary, lineHeight: 20 },
  aiBtn: {
    flexDirection: "row", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: "#F0FAFF", borderRadius: 999, borderWidth: 1, borderColor: colors.primary,
  },
  aiBtnText: { color: colors.primaryDark, fontWeight: "700" },
});
