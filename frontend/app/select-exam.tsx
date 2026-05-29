// First-step onboarding: "What exam do you want to practise for?"
// Lists exam families. State-specific families route to /select-state?family=X.
// National families subscribe immediately and go to the main app.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { useAuth } from "@/src/auth";
import { colors, radius, spacing, typography } from "@/src/theme";

type Family = {
  id: string;
  name: string;
  icon: any;
  color: string;
  description: string;
};

const STATE_SPECIFIC_FAMILIES = ["driving"]; // future: "heavy_vehicle" etc.

export default function SelectExam() {
  const router = useRouter();
  const { refresh } = useAuth();
  const params = useLocalSearchParams<{ from?: string }>();
  const isAdding = params.from === "add"; // true when reached from "+ Add another exam"

  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ families: Family[] }>("/exams/families", { auth: false });
        setFamilies(r.families);
      } catch (e: any) {
        Alert.alert("Couldn't load exams", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const choose = async (family: Family) => {
    if (STATE_SPECIFIC_FAMILIES.includes(family.id)) {
      // Route to state picker, which will call subscribe with family+state
      router.push(`/select-state?family=${family.id}${isAdding ? "&from=add" : ""}`);
      return;
    }
    // National exam — subscribe directly
    setSaving(family.id);
    try {
      await api("/user/exams/subscribe", {
        method: "POST",
        body: { family: family.id, set_primary: !isAdding ? true : false },
      });
      await refresh();
      // Tiny celebration toast then navigate
      Alert.alert(
        "🦘 You're in!",
        `${family.name} added to your study plan. Let's go!`,
        [{ text: "Start studying", onPress: () => router.replace("/(tabs)") }],
      );
    } catch (e: any) {
      Alert.alert("Couldn't add exam", e.message);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="select-exam-screen">
      <View style={styles.header}>
        {isAdding && (
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {isAdding ? "Add another exam" : "What exam you want to practise for?"}
          </Text>
          <Text style={styles.sub}>
            {isAdding
              ? "Pick another family of exams to add to your study plan."
              : "Pick your goal — we'll personalise everything around it."}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {families.map((fam) => {
          const isStateSpecific = STATE_SPECIFIC_FAMILIES.includes(fam.id);
          return (
            <TouchableOpacity
              key={fam.id}
              activeOpacity={0.85}
              onPress={() => choose(fam)}
              disabled={saving !== null}
              style={[styles.card, { borderColor: fam.color }]}
              testID={`family-${fam.id}`}
            >
              <View style={[styles.iconWrap, { backgroundColor: fam.color + "22" }]}>
                <Ionicons name={fam.icon} size={32} color={fam.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{fam.name}</Text>
                <Text style={styles.cardDesc}>{fam.description}</Text>
                {isStateSpecific && (
                  <View style={styles.tag}>
                    <Ionicons name="location-outline" size={11} color={colors.textSecondary} />
                    <Text style={styles.tagText}>Pick your state next</Text>
                  </View>
                )}
              </View>
              {saving === fam.id ? (
                <ActivityIndicator color={fam.color} />
              ) : (
                <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
              )}
            </TouchableOpacity>
          );
        })}

        <Text style={styles.footer}>
          You can always add more exams later from Profile → My Exams.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: "center", alignItems: "center" },
  header: { padding: spacing.lg, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "flex-start" },
  title: { ...typography.h1, fontSize: 24 },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 60, gap: spacing.md },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#fff", borderRadius: radius.xl,
    padding: spacing.md, borderWidth: 2, borderBottomWidth: 4,
  },
  iconWrap: {
    width: 60, height: 60, borderRadius: 16,
    justifyContent: "center", alignItems: "center",
  },
  cardTitle: { fontSize: 17, fontWeight: "800", color: colors.textPrimary },
  cardDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    marginTop: 6, alignSelf: "flex-start",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
    backgroundColor: colors.bgAlt,
  },
  tagText: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },
  footer: { ...typography.caption, textAlign: "center", marginTop: spacing.lg, color: colors.textTertiary },
});
