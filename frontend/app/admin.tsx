// Admin dashboard — analytics + question management.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PButton } from "@/src/components/PButton";
import { colors, radius, spacing, typography } from "@/src/theme";

type Analytics = {
  total_users: number; total_attempts: number; total_questions: number;
  by_plan: Record<string, number>;
  recent_attempts: { category_id: string; score_percent: number; passed: boolean; user_id: string }[];
};

export default function Admin() {
  const router = useRouter();
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    category_id: "dkt",
    topic: "",
    question: "",
    options: ["", "", "", ""],
    correct: 0,
    explanation: "",
    difficulty: "medium",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<Analytics>("/admin/analytics");
        setAnalytics(r);
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
    })();
  }, []);

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="lock-closed" size={48} color={colors.wrong} />
        <Text style={typography.h3}>Admin access only</Text>
        <PButton title="Go Back" variant="secondary" onPress={() => router.back()} style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  const submit = async () => {
    if (!form.topic || !form.question || form.options.some((o) => !o)) {
      Alert.alert("Missing fields", "Please fill topic, question and all options.");
      return;
    }
    setSaving(true);
    try {
      await api("/admin/questions", { method: "POST", body: form });
      Alert.alert("Saved", "Question added successfully.");
      setForm({ ...form, topic: "", question: "", options: ["", "", "", ""], explanation: "", correct: 0 });
      setShowForm(false);
      const r = await api<Analytics>("/admin/analytics");
      setAnalytics(r);
    } catch (e: any) {
      Alert.alert("Save failed", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>Admin</Text>
          </View>

          {analytics && (
            <View style={styles.grid}>
              <Stat label="Users" value={analytics.total_users} />
              <Stat label="Questions" value={analytics.total_questions} />
              <Stat label="Attempts" value={analytics.total_attempts} />
            </View>
          )}

          {analytics && (
            <View style={styles.card}>
              <Text style={styles.section}>Plan distribution</Text>
              {Object.entries(analytics.by_plan).map(([p, c]) => (
                <View key={p} style={styles.planRow}>
                  <Text style={styles.planName}>{p.toUpperCase()}</Text>
                  <Text style={styles.planCount}>{c}</Text>
                </View>
              ))}
            </View>
          )}

          <PButton
            title={showForm ? "Cancel" : "+ Add Question"}
            variant={showForm ? "secondary" : "success"}
            onPress={() => setShowForm((v) => !v)}
            testID="admin-toggle-form"
          />

          {showForm && (
            <View style={styles.card}>
              <Text style={styles.section}>New Question</Text>

              <Label text="Category" />
              <View style={styles.chipRow}>
                {["dkt", "citizenship", "rsa"].map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setForm((f) => ({ ...f, category_id: c }))}
                    style={[styles.chip, form.category_id === c && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, form.category_id === c && { color: "#0A2A33" }]}>
                      {c.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Label text="Topic" />
              <TextInput
                value={form.topic}
                onChangeText={(t) => setForm({ ...form, topic: t })}
                style={styles.input}
                placeholder="e.g. Speed Limits"
                placeholderTextColor={colors.textTertiary}
              />

              <Label text="Question" />
              <TextInput
                value={form.question}
                onChangeText={(t) => setForm({ ...form, question: t })}
                style={[styles.input, { minHeight: 70 }]}
                multiline
                placeholderTextColor={colors.textTertiary}
                placeholder="What is the question?"
              />

              {form.options.map((opt, i) => (
                <View key={i}>
                  <Label text={`Option ${String.fromCharCode(65 + i)}`} />
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <TextInput
                      value={opt}
                      onChangeText={(t) =>
                        setForm((f) => {
                          const nx = [...f.options];
                          nx[i] = t;
                          return { ...f, options: nx };
                        })
                      }
                      style={[styles.input, { flex: 1 }]}
                      placeholderTextColor={colors.textTertiary}
                    />
                    <TouchableOpacity
                      onPress={() => setForm({ ...form, correct: i })}
                      style={[styles.correctBtn, form.correct === i && { backgroundColor: colors.correct }]}
                    >
                      <Ionicons
                        name={form.correct === i ? "checkmark" : "ellipse-outline"}
                        size={20}
                        color={form.correct === i ? "#fff" : colors.textTertiary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <Label text="Explanation" />
              <TextInput
                value={form.explanation}
                onChangeText={(t) => setForm({ ...form, explanation: t })}
                style={[styles.input, { minHeight: 60 }]}
                multiline
                placeholderTextColor={colors.textTertiary}
                placeholder="Why is the correct answer correct?"
              />

              <PButton
                title="Save Question"
                onPress={submit}
                loading={saving}
                variant="success"
                testID="admin-save-question"
              />
            </View>
          )}

          {analytics && (
            <View style={styles.card}>
              <Text style={styles.section}>Recent attempts</Text>
              {analytics.recent_attempts.slice(0, 10).map((a, i) => (
                <View key={i} style={styles.attemptRow}>
                  <Text style={styles.attemptCat}>{a.category_id.toUpperCase()}</Text>
                  <Text style={styles.attemptScore}>{a.score_percent}%</Text>
                  <Ionicons
                    name={a.passed ? "checkmark-circle" : "close-circle"}
                    color={a.passed ? colors.correct : colors.wrong}
                    size={20}
                  />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.bg, gap: 12 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { ...typography.h1, fontSize: 26 },
  grid: { flexDirection: "row", gap: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
    padding: spacing.md, alignItems: "center",
  },
  statValue: { fontWeight: "800", fontSize: 24, color: colors.primaryDark },
  statLabel: { ...typography.caption, marginTop: 4 },
  card: {
    backgroundColor: "#fff", padding: spacing.md, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, gap: spacing.sm,
  },
  section: { ...typography.h3, fontSize: 18 },
  planRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  planName: { fontWeight: "700" },
  planCount: { fontWeight: "800", color: colors.primaryDark },
  label: { fontWeight: "700", color: colors.textSecondary, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.bgAlt, borderRadius: radius.md, padding: 12,
    fontSize: 15, fontWeight: "600", color: colors.textPrimary,
    borderWidth: 2, borderColor: colors.border,
  },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.bgAlt, borderWidth: 2, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  chipText: { fontWeight: "800", color: colors.textSecondary },
  correctBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgAlt },
  attemptRow: { flexDirection: "row", paddingVertical: 8, gap: 12, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  attemptCat: { flex: 1, fontWeight: "700" },
  attemptScore: { fontWeight: "800", color: colors.primaryDark },
});
