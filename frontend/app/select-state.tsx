// State/territory picker — shown after first login and reachable from settings.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PButton } from "@/src/components/PButton";
import { colors, radius, spacing, typography } from "@/src/theme";

const STATES: { code: string; name: string; sub: string; icon: any; color: string }[] = [
  { code: "NSW", name: "New South Wales", sub: "NSW Driver Knowledge Test", icon: "location", color: "#00D1FF" },
  { code: "VIC", name: "Victoria",         sub: "VIC Learner Permit Test",   icon: "location", color: "#1F8FFF" },
  { code: "QLD", name: "Queensland",       sub: "QLD PrepL Test",            icon: "location", color: "#FF4D6D" },
  { code: "WA",  name: "Western Australia",sub: "WA Learner Theory Test",    icon: "location", color: "#FFB300" },
  { code: "SA",  name: "South Australia",  sub: "SA Driver Knowledge Test",  icon: "location", color: "#C2185B" },
  { code: "ACT", name: "Australian Capital Territory", sub: "ACT Road Rules Test", icon: "location", color: "#673AB7" },
  { code: "TAS", name: "Tasmania",         sub: "TAS Learner Knowledge Test",icon: "location", color: "#009688" },
  { code: "NT",  name: "Northern Territory",sub:"NT Learner Test",           icon: "location", color: "#E65100" },
];

export default function SelectState() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const params = useLocalSearchParams<{ from?: string }>();
  const isFromSettings = params.from === "settings";
  const [selected, setSelected] = useState<string | null>(user?.state ?? null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!selected) {
      Alert.alert("Pick a state", "Choose your state or territory to personalise your driving content.");
      return;
    }
    setSaving(true);
    try {
      await api("/user/profile", {
        method: "PATCH",
        body: { state: selected },
      });
      await refresh();
      if (isFromSettings) router.back();
      else router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="select-state-screen">
      <View style={styles.header}>
        {isFromSettings && (
          <TouchableOpacity onPress={() => router.back()} testID="select-state-back">
            <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={styles.h1}>Where do you live?</Text>
      </View>
      <Text style={styles.sub}>
        Driving rules vary by state. Pick your state or territory so we can show you the right learner content.
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        {STATES.map((s) => {
          const isSel = selected === s.code;
          return (
            <TouchableOpacity
              key={s.code}
              testID={`state-${s.code}`}
              activeOpacity={0.85}
              onPress={() => setSelected(s.code)}
              style={[styles.row, isSel && { borderColor: s.color, backgroundColor: s.color + "11" }]}
            >
              <View style={[styles.bubble, { backgroundColor: s.color + "22" }]}>
                <Text style={[styles.code, { color: s.color }]}>{s.code}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.subtle}>{s.sub}</Text>
              </View>
              <Ionicons
                name={isSel ? "checkmark-circle" : "ellipse-outline"}
                size={26}
                color={isSel ? s.color : colors.textTertiary}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <PButton
          title={isFromSettings ? "Save" : "Continue"}
          onPress={save}
          loading={saving}
          disabled={!selected}
          testID="select-state-save"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  h1: { ...typography.h1, fontSize: 26 },
  sub: { ...typography.body, color: colors.textSecondary, paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 100 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, backgroundColor: "#fff",
    borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
  },
  bubble: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  code: { fontWeight: "800", letterSpacing: 1 },
  name: { fontWeight: "800", fontSize: 16, color: colors.textPrimary },
  subtle: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  footer: { padding: spacing.lg, borderTopWidth: 2, borderTopColor: colors.border, backgroundColor: "#fff" },
});
