// Flashcards deck — swipe/tap reveal.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PButton } from "@/src/components/PButton";
import { colors, radius, spacing, typography } from "@/src/theme";

type Card = { card_id: string; front: string; back: string; category_id?: string };

export default function Flashcards() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ cards: Card[] }>("/flashcards/me");
        setCards(r.cards);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const c = cards[idx];
  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="flashcards-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="flashcards-back">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Flashcards</Text>
        <Text style={styles.count}>
          {cards.length > 0 ? `${idx + 1}/${cards.length}` : ""}
        </Text>
      </View>

      <View style={styles.body}>
        {loading ? (
          <Text style={styles.subtle}>Loading…</Text>
        ) : cards.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="albums" size={70} color={colors.textTertiary} />
            <Text style={typography.h3}>No flashcards yet</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center" }]}>
              Take an exam and tap “Make AI Flashcards” on the results screen.
            </Text>
            <PButton title="Browse Exams" onPress={() => router.replace("/(tabs)/exams")} testID="flashcards-empty-cta" />
          </View>
        ) : (
          <>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.card, flipped ? styles.cardBack : styles.cardFront]}
              onPress={() => setFlipped((f) => !f)}
              testID="flashcard-tap"
            >
              <Text style={styles.cardLabel}>{flipped ? "ANSWER" : "QUESTION"}</Text>
              <Text style={styles.cardText}>{flipped ? c.back : c.front}</Text>
              <Text style={styles.cardHint}>Tap to {flipped ? "see question" : "reveal answer"}</Text>
            </TouchableOpacity>

            <View style={styles.navRow}>
              <PButton
                title="Previous"
                variant="secondary"
                onPress={() => { setIdx((v) => Math.max(0, v - 1)); setFlipped(false); }}
                disabled={idx === 0}
                style={{ flex: 1 }}
                testID="flashcard-prev"
              />
              <PButton
                title="Next"
                onPress={() => { setIdx((v) => Math.min(cards.length - 1, v + 1)); setFlipped(false); }}
                disabled={idx === cards.length - 1}
                style={{ flex: 1 }}
                testID="flashcard-next"
              />
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", padding: spacing.md, alignItems: "center", gap: 12,
    borderBottomWidth: 2, borderBottomColor: colors.border,
  },
  title: { ...typography.h2, fontSize: 22, flex: 1 },
  count: { ...typography.caption, fontWeight: "800", color: colors.primaryDark },
  body: { flex: 1, padding: spacing.lg, justifyContent: "space-between" },
  subtle: { color: colors.textSecondary },
  empty: { alignItems: "center", gap: spacing.md, flex: 1, justifyContent: "center" },
  card: {
    flex: 1, borderRadius: radius.xxl, padding: spacing.xl,
    alignItems: "center", justifyContent: "center", gap: spacing.md,
    borderWidth: 3, borderBottomWidth: 6,
  },
  cardFront: { backgroundColor: "#fff", borderColor: colors.primary },
  cardBack: { backgroundColor: "#E8FFF8", borderColor: colors.primaryGreen },
  cardLabel: { fontWeight: "800", letterSpacing: 2, color: colors.textSecondary },
  cardText: { ...typography.h2, textAlign: "center", lineHeight: 32 },
  cardHint: { ...typography.caption, color: colors.textTertiary },
  navRow: { flexDirection: "row", gap: 12, marginTop: spacing.md },
});
