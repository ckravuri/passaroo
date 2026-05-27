// Onboarding carousel — 3 slides with kangaroo mascot + brand pitch.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PButton } from "@/src/components/PButton";
import { colors, DISCLAIMER, IMAGES, spacing, typography } from "@/src/theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    title: "G'day, I'm Passaroo!",
    subtitle: "Your AI-powered Aussie study buddy for the DKT, Citizenship Test and RSA.",
    icon: "school" as const,
    color: colors.primary,
  },
  {
    title: "Practice that actually sticks",
    subtitle: "Smart mock exams, flashcards from your mistakes and weak-topic coaching.",
    icon: "sparkles" as const,
    color: colors.primaryGreen,
  },
  {
    title: "Streaks, XP and pass scores",
    subtitle: "Stay motivated daily and see your exam-ready probability climb.",
    icon: "trophy" as const,
    color: colors.fire,
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const ref = useRef<ScrollView | null>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== idx) setIdx(i);
  };

  const next = () => {
    if (idx < SLIDES.length - 1) {
      ref.current?.scrollTo({ x: (idx + 1) * width, animated: true });
    } else {
      router.replace("/login");
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="onboarding-screen">
      <View style={styles.skipRow}>
        <Text style={styles.brand}>PASSAROO</Text>
        <Text
          testID="onboarding-skip"
          style={styles.skipText}
          onPress={() => router.replace("/login")}
        >
          Skip
        </Text>
      </View>

      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={[styles.iconBlob, { backgroundColor: s.color + "22" }]}>
              <Image source={{ uri: IMAGES.mascot }} style={styles.mascot} resizeMode="contain" />
              <View style={[styles.badge, { backgroundColor: s.color }]}>
                <Ionicons name={s.icon} size={28} color="#fff" />
              </View>
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.subtitle}>{s.subtitle}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === idx && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <PButton
          title={idx === SLIDES.length - 1 ? "Get Started" : "Next"}
          onPress={next}
          testID="onboarding-next"
        />
        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  skipRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 8 },
  brand: { ...typography.h3, color: colors.primaryDark, letterSpacing: 2 },
  skipText: { ...typography.caption, color: colors.textSecondary, fontSize: 16, fontWeight: "700" },
  slide: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconBlob: {
    width: 260, height: 260, borderRadius: 130, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl,
  },
  mascot: { width: 220, height: 220 },
  badge: {
    position: "absolute", bottom: 10, right: 10, width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff",
  },
  title: { ...typography.h1, textAlign: "center" },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.md, fontSize: 17 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 28 },
  footer: { paddingHorizontal: 24, paddingBottom: 24, gap: 12 },
  disclaimer: { ...typography.caption, textAlign: "center", color: colors.textTertiary, fontSize: 11 },
});
