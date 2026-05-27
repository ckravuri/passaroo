// Profile + Settings.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { PButton } from "@/src/components/PButton";
import { colors, DISCLAIMER, IMAGES, radius, spacing, typography } from "@/src/theme";

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          {user.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <Image source={{ uri: IMAGES.mascot }} style={styles.avatar} resizeMode="contain" />
          )}
          <Text style={styles.name} testID="profile-name">{user.name}</Text>
          <Text style={styles.email} testID="profile-email">{user.email}</Text>
          <View style={[styles.planBadge, planStyle(user.plan)]}>
            <Text style={styles.planText}>{user.plan.toUpperCase()}</Text>
          </View>
        </View>

        <Row icon="card" label="Subscription" onPress={() => router.push("/paywall")} testID="row-subscription" />
        <Row icon="albums" label="My Flashcards" onPress={() => router.push("/flashcards")} testID="row-flashcards" />
        {user.is_admin && (
          <Row icon="shield-checkmark" label="Admin Dashboard" onPress={() => router.push("/admin")} testID="row-admin" />
        )}
        <Row icon="information-circle" label="About Passaroo" onPress={() => router.push("/about")} testID="row-about" />

        <PButton title="Sign Out" variant="secondary" onPress={() => { signOut(); router.replace("/onboarding"); }} testID="signout-btn" />

        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.row} testID={testID}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={colors.primaryDark} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

function planStyle(plan: string) {
  switch (plan) {
    case "premium":
      return { backgroundColor: colors.premium };
    case "pro":
      return { backgroundColor: "#0A2A33" };
    default:
      return { backgroundColor: colors.bgAlt };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  header: { alignItems: "center", paddingVertical: spacing.lg },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: colors.primary },
  name: { ...typography.h2, marginTop: spacing.md },
  email: { ...typography.caption, marginTop: 2 },
  planBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, marginTop: spacing.md },
  planText: { color: "#fff", fontWeight: "800", letterSpacing: 1 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: spacing.md,
    backgroundColor: "#fff", borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
  },
  rowIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgAlt,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { flex: 1, fontWeight: "700", fontSize: 16, color: colors.textPrimary },
  disclaimer: { ...typography.caption, fontSize: 11, color: colors.textTertiary, textAlign: "center", marginTop: spacing.lg },
});
