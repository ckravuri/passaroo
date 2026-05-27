// Admin dashboard — Stats, Questions (CRUD + bulk import), Users (plan/ban)
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

// --------- Types ---------
type Category = { id: string; name: string; family: string | null; state: string | null };
type Stats = {
  today: string;
  totals: { users: number; questions: number; attempts: number; categories: number };
  signups: { day: number; week: number; month: number };
  attempts_week: number;
  by_plan: Record<string, number>;
  by_state: Record<string, number>;
  per_category: { id: string; name: string; family: string; state: string | null; question_count: number; attempt_count: number }[];
};
type Question = {
  question_id: string;
  category_id: string;
  topic: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  difficulty: string;
  state?: string | null;
};
type AdminUser = {
  user_id: string; email: string; name: string;
  plan: string; is_admin?: boolean; state?: string | null;
  banned?: boolean; xp?: number; streak_days?: number;
};

type Tab = "stats" | "questions" | "users";

const PLANS = ["free", "premium", "pro"] as const;

// =========================================================================
export default function Admin() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("stats");

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="lock-closed" size={48} color={colors.wrong} />
        <Text style={typography.h3}>Admin access only</Text>
        <PButton title="Go Back" variant="secondary" onPress={() => router.back()} style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Admin</Text>
        </View>

        <View style={styles.tabBar}>
          {(["stats", "questions", "users"] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              testID={`admin-tab-${t}`}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "stats" && <StatsPanel />}
        {tab === "questions" && <QuestionsPanel />}
        {tab === "users" && <UsersPanel />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// =========================================================================
function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<Stats>("/admin/stats");
      setStats(r);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!stats) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.grid}>
        <StatCard label="Users" value={stats.totals.users} color={colors.primary} />
        <StatCard label="Questions" value={stats.totals.questions} color={colors.primaryGreen} />
        <StatCard label="Attempts" value={stats.totals.attempts} color={colors.fire} />
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Growth</Text>
        <Row label="Signups · 24h" value={stats.signups.day} />
        <Row label="Signups · 7d" value={stats.signups.week} />
        <Row label="Signups · 30d" value={stats.signups.month} />
        <Row label="Exam attempts · 7d" value={stats.attempts_week} />
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Plan distribution</Text>
        {Object.entries(stats.by_plan).sort((a, b) => b[1] - a[1]).map(([p, c]) => (
          <Row key={p} label={p.toUpperCase()} value={c} />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>User state distribution</Text>
        {Object.entries(stats.by_state).sort((a, b) => b[1] - a[1]).map(([s, c]) => (
          <Row key={s} label={s} value={c} />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Per-category</Text>
        {stats.per_category.map((c) => (
          <View key={c.id} style={styles.catRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.catName}>{c.name}</Text>
              <Text style={styles.catSub}>{c.family ?? "—"}{c.state ? ` · ${c.state}` : ""}</Text>
            </View>
            <Text style={styles.catCount}>{c.question_count}Q · {c.attempt_count}A</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// =========================================================================
function QuestionsPanel() {
  const [cats, setCats] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("dkt_nsw");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"list" | "add" | "import" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await api<{ categories: Category[] }>("/exams/categories", { auth: false });
      setCats(r.categories);
    })();
  }, []);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ questions: Question[] }>(`/admin/questions?category_id=${selectedCat}`);
      setQuestions(r.questions);
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedCat]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  const onDelete = (qid: string) => {
    Alert.alert("Delete?", "This permanently removes the question.", [
      { text: "Cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await api(`/admin/questions/${qid}`, { method: "DELETE" });
            await loadQuestions();
          } catch (e: any) { Alert.alert("Failed", e.message); }
        }
      }
    ]);
  };

  if (mode === "add" || mode === "edit") {
    const editing = mode === "edit" ? questions.find((q) => q.question_id === editingId) : null;
    return <QuestionForm
      cats={cats}
      defaultCatId={selectedCat}
      editing={editing ?? undefined}
      onDone={async () => { setMode("list"); await loadQuestions(); }}
      onCancel={() => setMode("list")}
    />;
  }
  if (mode === "import") {
    return <BulkImportPanel
      cats={cats}
      defaultCatId={selectedCat}
      onDone={async () => { setMode("list"); await loadQuestions(); }}
      onCancel={() => setMode("list")}
    />;
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", gap: 6, paddingRight: 16 }}>
          {cats.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setSelectedCat(c.id)}
              style={[styles.chip, selectedCat === c.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, selectedCat === c.id && { color: "#0A2A33" }]}>
                {c.id}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <PButton title="+ Add" onPress={() => setMode("add")} variant="success" style={{ flex: 1 }} testID="admin-add-q" />
        <PButton title="Bulk Import" onPress={() => setMode("import")} variant="secondary" style={{ flex: 1 }} testID="admin-bulk" />
      </View>

      <Text style={[styles.section, { marginTop: spacing.md }]}>
        {questions.length} question{questions.length === 1 ? "" : "s"}
      </Text>

      {loading && <ActivityIndicator color={colors.primary} />}

      {questions.map((q) => (
        <View key={q.question_id} style={styles.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={styles.qTopic}>{q.topic.toUpperCase()} · {q.difficulty}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => { setEditingId(q.question_id); setMode("edit"); }} testID={`q-edit-${q.question_id}`}>
                <Ionicons name="create" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(q.question_id)} testID={`q-del-${q.question_id}`}>
                <Ionicons name="trash" size={22} color={colors.wrong} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.qText}>{q.question}</Text>
          {q.options.map((o, i) => (
            <Text key={i} style={[styles.optionLine, i === q.correct && styles.optionCorrect]}>
              {i === q.correct ? "✓ " : "  "}{String.fromCharCode(65 + i)}. {o}
            </Text>
          ))}
        </View>
      ))}

      {!loading && questions.length === 0 && (
        <Text style={styles.subtle}>No questions yet for this category.</Text>
      )}
    </ScrollView>
  );
}

// =========================================================================
function QuestionForm({
  cats, defaultCatId, editing, onDone, onCancel,
}: {
  cats: Category[];
  defaultCatId: string;
  editing?: Question;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    category_id: editing?.category_id ?? defaultCatId,
    topic: editing?.topic ?? "",
    question: editing?.question ?? "",
    options: editing?.options ?? ["", "", "", ""],
    correct: editing?.correct ?? 0,
    explanation: editing?.explanation ?? "",
    difficulty: editing?.difficulty ?? "medium",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.topic || !form.question || form.options.some((o) => !o)) {
      Alert.alert("Missing fields", "Fill topic, question and all options."); return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api(`/admin/questions/${editing.question_id}`, { method: "PATCH", body: form });
      } else {
        await api("/admin/questions", { method: "POST", body: form });
      }
      onDone();
    } catch (e: any) {
      Alert.alert("Save failed", e.message);
    } finally { setSaving(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.section}>{editing ? "Edit question" : "New question"}</Text>
        <TouchableOpacity onPress={onCancel}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 6, paddingRight: 16 }}>
          {cats.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setForm((f) => ({ ...f, category_id: c.id }))}
              style={[styles.chip, form.category_id === c.id && styles.chipActive]}
              disabled={!!editing}
            >
              <Text style={[styles.chipText, form.category_id === c.id && { color: "#0A2A33" }]}>{c.id}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.label}>Topic</Text>
      <TextInput
        value={form.topic}
        onChangeText={(t) => setForm({ ...form, topic: t })}
        style={styles.input}
        placeholder="e.g. Speed Limits"
        placeholderTextColor={colors.textTertiary}
        testID="q-form-topic"
      />

      <Text style={styles.label}>Difficulty</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {["easy", "medium", "hard"].map((d) => (
          <TouchableOpacity
            key={d}
            onPress={() => setForm({ ...form, difficulty: d })}
            style={[styles.chip, form.difficulty === d && styles.chipActive]}
          >
            <Text style={[styles.chipText, form.difficulty === d && { color: "#0A2A33" }]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Question</Text>
      <TextInput
        value={form.question}
        onChangeText={(t) => setForm({ ...form, question: t })}
        style={[styles.input, { minHeight: 80 }]}
        multiline
        placeholderTextColor={colors.textTertiary}
        placeholder="What is the question?"
        testID="q-form-question"
      />

      {form.options.map((opt, i) => (
        <View key={i}>
          <Text style={styles.label}>Option {String.fromCharCode(65 + i)}</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              value={opt}
              onChangeText={(t) => setForm((f) => {
                const nx = [...f.options]; nx[i] = t; return { ...f, options: nx };
              })}
              style={[styles.input, { flex: 1 }]}
              placeholderTextColor={colors.textTertiary}
            />
            <TouchableOpacity
              onPress={() => setForm({ ...form, correct: i })}
              style={[styles.correctBtn, form.correct === i && { backgroundColor: colors.correct }]}
              testID={`q-form-correct-${i}`}
            >
              <Ionicons name={form.correct === i ? "checkmark" : "ellipse-outline"} size={20} color={form.correct === i ? "#fff" : colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <Text style={styles.label}>Explanation</Text>
      <TextInput
        value={form.explanation}
        onChangeText={(t) => setForm({ ...form, explanation: t })}
        style={[styles.input, { minHeight: 70 }]}
        multiline
        placeholderTextColor={colors.textTertiary}
        placeholder="Why is the correct answer correct?"
      />

      <PButton title={editing ? "Save changes" : "Add question"} onPress={save} loading={saving} variant="success" testID="q-form-save" />
      <PButton title="Cancel" onPress={onCancel} variant="secondary" />
    </ScrollView>
  );
}

// =========================================================================
function BulkImportPanel({
  cats, defaultCatId, onDone, onCancel,
}: {
  cats: Category[];
  defaultCatId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [catId, setCatId] = useState(defaultCatId);
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; total_attempted: number; errors: any[] } | null>(null);

  const exampleJson = useMemo(() => JSON.stringify([{
    topic: "Speed Limits",
    difficulty: "easy",
    question: "What is the default urban speed limit?",
    options: ["40 km/h", "50 km/h", "60 km/h", "70 km/h"],
    correct: 1,
    explanation: "50 km/h is the default built-up area limit.",
    tags: ["speed", "urban"],
  }], null, 2), []);

  const run = async () => {
    let parsed: any;
    try { parsed = JSON.parse(json); }
    catch { Alert.alert("Invalid JSON", "Paste a valid JSON array."); return; }
    if (!Array.isArray(parsed)) { Alert.alert("Wrong shape", "Top-level must be an array."); return; }
    setBusy(true);
    try {
      const r = await api<any>("/admin/questions/bulk-import", {
        method: "POST",
        body: { category_id: catId, questions: parsed },
      });
      setResult(r);
    } catch (e: any) {
      Alert.alert("Import failed", e.message);
    } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.section}>Bulk import</Text>
        <TouchableOpacity onPress={onCancel}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Target category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {cats.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setCatId(c.id)}
              style={[styles.chip, catId === c.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, catId === c.id && { color: "#0A2A33" }]}>{c.id}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.label}>JSON array of questions</Text>
      <TextInput
        value={json}
        onChangeText={setJson}
        style={[styles.input, { minHeight: 240, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }), fontSize: 12 }]}
        multiline
        placeholder={exampleJson}
        placeholderTextColor={colors.textTertiary}
        testID="bulk-json"
      />

      <PButton title="Run import" onPress={run} loading={busy} variant="success" testID="bulk-run" />
      <PButton title="Use example" onPress={() => setJson(exampleJson)} variant="secondary" />

      {result && (
        <View style={styles.card}>
          <Text style={styles.section}>Result</Text>
          <Row label="Inserted" value={result.inserted} />
          <Row label="Attempted" value={result.total_attempted} />
          <Row label="Errors" value={result.errors.length} />
          {result.errors.slice(0, 5).map((e, i) => (
            <Text key={i} style={styles.errSmall}>#{e.index}: {e.error}</Text>
          ))}
          {result.inserted > 0 && (
            <PButton title="Done" onPress={onDone} variant="success" />
          )}
        </View>
      )}
    </ScrollView>
  );
}

// =========================================================================
function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ users: AdminUser[] }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setUsers(r.users);
    } catch (e: any) { Alert.alert("Failed", e.message); }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const changePlan = (u: AdminUser, next: string) => {
    Alert.alert("Change plan?", `Set ${u.email} → ${next.toUpperCase()}?`, [
      { text: "Cancel" },
      { text: "Change", onPress: async () => {
        try {
          await api(`/admin/users/${u.user_id}`, { method: "PATCH", body: { plan: next } });
          await load();
        } catch (e: any) { Alert.alert("Failed", e.message); }
      }},
    ]);
  };

  const toggleBan = (u: AdminUser) => {
    const next = !u.banned;
    Alert.alert(next ? "Ban user?" : "Unban user?", `${next ? "Ban" : "Unban"} ${u.email}?`, [
      { text: "Cancel" },
      { text: next ? "Ban" : "Unban", style: next ? "destructive" : "default",
        onPress: async () => {
          try {
            await api(`/admin/users/${u.user_id}`, { method: "PATCH", body: { banned: next } });
            await load();
          } catch (e: any) { Alert.alert("Failed", e.message); }
        }},
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <TextInput
        value={q}
        onChangeText={setQ}
        style={styles.input}
        placeholder="Search by email or name…"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={load}
        testID="users-search"
      />

      {loading && <ActivityIndicator color={colors.primary} />}

      {users.map((u) => (
        <View key={u.user_id} style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{u.name || "(no name)"}{u.is_admin && " 🛡️"}</Text>
              <Text style={styles.userEmail}>{u.email}</Text>
              <Text style={styles.userMeta}>
                {u.plan.toUpperCase()} · {u.state ?? "—"} · XP {u.xp ?? 0} · 🔥 {u.streak_days ?? 0}d
                {u.banned ? " · BANNED" : ""}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {PLANS.map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => changePlan(u, p)}
                style={[styles.chip, u.plan === p && styles.chipActive]}
                testID={`user-${u.user_id}-plan-${p}`}
              >
                <Text style={[styles.chipText, u.plan === p && { color: "#0A2A33" }]}>{p}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => toggleBan(u)} style={[styles.chip, { backgroundColor: u.banned ? colors.correct + "33" : colors.wrong + "33" }]}>
              <Text style={[styles.chipText, { color: u.banned ? colors.correct : colors.wrong }]}>
                {u.banned ? "Unban" : "Ban"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {!loading && users.length === 0 && (
        <Text style={styles.subtle}>No users match.</Text>
      )}
    </ScrollView>
  );
}

// --------- Small helpers ---------
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderBottomColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function Row({ label, value }: { label: string; value: any }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey}>{label}</Text>
      <Text style={styles.kvVal}>{value}</Text>
    </View>
  );
}

// --------- Styles ---------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.bg, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  title: { ...typography.h1, fontSize: 26 },
  tabBar: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.lg, backgroundColor: colors.bgAlt, borderWidth: 2, borderColor: colors.border },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  tabText: { fontWeight: "800", fontSize: 12, color: colors.textSecondary, letterSpacing: 0.5 },
  tabTextActive: { color: "#0A2A33" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  grid: { flexDirection: "row", gap: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
    padding: spacing.md, alignItems: "center",
  },
  statValue: { fontWeight: "800", fontSize: 24 },
  statLabel: { ...typography.caption, marginTop: 4 },
  card: {
    backgroundColor: "#fff", padding: spacing.md, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, gap: spacing.sm,
  },
  section: { ...typography.h3, fontSize: 17 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  kvKey: { color: colors.textSecondary, fontWeight: "600" },
  kvVal: { fontWeight: "800", color: colors.primaryDark },
  catRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  catName: { fontWeight: "700", fontSize: 14, color: colors.textPrimary },
  catSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  catCount: { fontWeight: "800", color: colors.primaryDark, fontSize: 12 },
  label: { fontWeight: "700", color: colors.textSecondary, marginTop: spacing.sm, fontSize: 12, letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.bgAlt, borderRadius: radius.md, padding: 12,
    fontSize: 14, fontWeight: "600", color: colors.textPrimary,
    borderWidth: 2, borderColor: colors.border,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.bgAlt, borderWidth: 2, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  chipText: { fontWeight: "800", color: colors.textSecondary, fontSize: 11 },
  correctBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgAlt },
  qTopic: { color: colors.primaryDark, fontWeight: "800", letterSpacing: 0.5, fontSize: 11 },
  qText: { fontWeight: "700", fontSize: 14, color: colors.textPrimary, marginVertical: 4 },
  optionLine: { fontSize: 13, color: colors.textSecondary, marginVertical: 1, paddingLeft: 4 },
  optionCorrect: { color: colors.correct, fontWeight: "800" },
  userName: { fontWeight: "800", fontSize: 15 },
  userEmail: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  userMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 4 },
  subtle: { color: colors.textSecondary, textAlign: "center", marginTop: spacing.md },
  error: { color: colors.wrong, padding: spacing.lg, textAlign: "center" },
  errSmall: { color: colors.wrong, fontSize: 11, paddingVertical: 2 },
});
