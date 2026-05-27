// Generic legal page component for Privacy & Security.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius, spacing, typography } from "@/src/theme";

export type Section = { heading: string; body: string };

export function LegalScreen({
  title,
  intro,
  sections,
  testID,
}: {
  title: string;
  intro: string;
  sections: Section[];
  testID?: string;
}): ReactNode {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID={testID}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="legal-back">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.h1}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>{intro}</Text>
        {sections.map((s, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.h2}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
        <Text style={styles.lastUpdated}>Last updated: February 2026</Text>
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
  h1: { ...typography.h2, fontSize: 22 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  intro: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  card: {
    backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, gap: 8,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
  },
  h2: { ...typography.h3, fontSize: 17 },
  body: { ...typography.body, lineHeight: 22, color: colors.textPrimary },
  lastUpdated: { ...typography.caption, textAlign: "center", color: colors.textTertiary, marginTop: spacing.md },
});
