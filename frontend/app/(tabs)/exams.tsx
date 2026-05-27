// Exams tab — grouped by family. Driving family collapses to 8 state DKTs.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, DISCLAIMER, radius, spacing, typography } from "@/src/theme";

type Cat = {
  id: string;
  family: string | null;
  state: string | null;
  name: string;
  short_name: string;
  description: string;
  icon: string;
  color: string;
  total_questions_in_exam: number;
  time_limit_minutes: number;
  pass_score_percent: number;
  question_bank_size: number;
};

type Family = {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  categories: Cat[];
};

export default function Exams() {
  const router = useRouter();
  const { user } = useAuth();
  const [families, setFamilies] = useState<Family[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ driving: true });

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ families: Family[] }>("/exams/families", { auth: false });
        setFamilies(r.families);
      } catch {}
    })();
  }, []);

  const toggle = (fid: string) => setExpanded((s) => ({ ...s, [fid]: !s[fid] }));

  const goExam = (id: string) =>
    router.push({ pathname: "/exam/[category]", params: { category: id } });

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="exams-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Mock Exams</Text>
        <Text style={styles.sub}>Pick a category and take a timed practice exam.</Text>

        {families.map((fam) => {
          const isDriving = fam.id === "driving";
          const open = expanded[fam.id] ?? false;
          return (
            <View key={fam.id} style={styles.familyBlock}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.familyHeader, { borderBottomColor: fam.color }]}
                onPress={() => toggle(fam.id)}
                testID={`family-${fam.id}`}
              >
                <View style={[styles.familyIcon, { backgroundColor: fam.color + "22" }]}>
                  <Ionicons name={fam.icon as any} size={26} color={fam.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.familyName}>{fam.name}</Text>
                  <Text style={styles.familyMeta}>
                    {fam.categories.length} exam{fam.categories.length === 1 ? "" : "s"} · {fam.description}
                  </Text>
                </View>
                <Ionicons
                  name={open ? "chevron-up" : "chevron-down"}
                  size={24}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              {open && (
                <View style={styles.familyBody}>
                  {fam.categories.map((c) => {
                    const isUserState = isDriving && user?.state && c.state === user.state;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        activeOpacity={0.85}
                        style={[
                          styles.examRow,
                          { borderLeftColor: c.color },
                          isUserState && { backgroundColor: c.color + "11" },
                        ]}
                        onPress={() => goExam(c.id)}
                        testID={`exam-row-${c.id}`}
                      >
                        <View style={[styles.examIcon, { backgroundColor: c.color + "22" }]}>
                          {c.state ? (
                            <Text style={[styles.stateCode, { color: c.color }]}>{c.state}</Text>
                          ) : (
                            <Ionicons name={c.icon as any} size={22} color={c.color} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.titleRow}>
                            <Text style={styles.examTitle} numberOfLines={1}>{c.name}</Text>
                            {isUserState && (
                              <View style={[styles.tagPill, { backgroundColor: c.color }]}>
                                <Text style={styles.tagPillText}>Yours</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.examMeta}>
                            {c.total_questions_in_exam} Qs · {c.time_limit_minutes} min · Pass {c.pass_score_percent}%
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {families.length === 0 && <Text style={styles.subtle}>Loading exams…</Text>}

        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  h1: { ...typography.h1, fontSize: 28 },
  sub: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  subtle: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  familyBlock: { gap: spacing.sm },
  familyHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    backgroundColor: "#fff", borderRadius: radius.xl,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
  },
  familyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  familyName: { ...typography.h3, fontSize: 18 },
  familyMeta: { ...typography.caption, fontSize: 12, marginTop: 2 },
  familyBody: { gap: 8, paddingLeft: spacing.sm },
  examRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    backgroundColor: "#fff", borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4,
  },
  examIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  stateCode: { fontWeight: "800", fontSize: 13, letterSpacing: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  examTitle: { fontWeight: "800", fontSize: 15, color: colors.textPrimary, flexShrink: 1 },
  examMeta: { ...typography.caption, fontSize: 12, marginTop: 2 },
  tagPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagPillText: { color: "#0A2A33", fontWeight: "800", fontSize: 10, letterSpacing: 0.5 },
  disclaimer: { ...typography.caption, fontSize: 11, color: colors.textTertiary, textAlign: "center", marginTop: spacing.lg },
});
