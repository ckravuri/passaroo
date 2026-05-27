// About / Legal disclaimer page.
import { useRouter } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, DISCLAIMER, IMAGES, radius, spacing, typography } from "@/src/theme";

export default function About() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="about-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>About Passaroo</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Image source={{ uri: IMAGES.mascot }} style={styles.mascot} resizeMode="contain" />
        <Text style={typography.h2}>Independent. Modern. Aussie.</Text>
        <Text style={styles.body}>
          Passaroo is an AI-powered Australian exam preparation companion. We help you study smarter for the
          Driver Knowledge Test, the Australian Citizenship Test and the Responsible Service of Alcohol —
          with timed mock exams, AI explanations, flashcards, weak-topic coaching and streak-based motivation.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Important Disclaimer</Text>
          <Text style={styles.cardText}>{DISCLAIMER}</Text>
          <Text style={styles.cardText}>
            All practice questions are independently written and paraphrased around publicly known learning
            objectives. They are not copied from any official exam.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How AI is used</Text>
          <Text style={styles.cardText}>
            AI is used only for explanations, the AI tutor, flashcard generation and study summaries.
            Exam questions are drawn from a static, human-curated bank.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", padding: spacing.md, alignItems: "center", gap: 12,
    borderBottomWidth: 2, borderBottomColor: colors.border,
  },
  title: { ...typography.h2, fontSize: 22 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  mascot: { width: 160, height: 160, alignSelf: "center" },
  body: { ...typography.body, color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: "#fff", borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
    padding: spacing.md, gap: 8,
  },
  cardTitle: { ...typography.h3, fontSize: 17 },
  cardText: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
});
