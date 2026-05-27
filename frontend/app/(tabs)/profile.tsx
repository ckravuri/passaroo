// Profile + Settings with privacy, security, delete account.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { PButton } from "@/src/components/PButton";
import { colors, DISCLAIMER, IMAGES, radius, spacing, typography } from "@/src/theme";

export default function Profile() {
  const { user, signOut, deleteAccount } = useAuth();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;

  const confirmDelete = () => {
    Alert.alert(
      "Delete account?",
      "This will permanently erase your account, exam history, flashcards, bookmarks and AI chats. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              router.replace("/onboarding");
            } catch (e: any) {
              Alert.alert("Failed", e.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

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

        <Section title="Study" />
        <Row icon="bookmark" label="Bookmarked Questions" onPress={() => router.push("/bookmarks")} testID="row-bookmarks" />
        <Row icon="refresh-circle" label="Retry Wrong Answers" onPress={() => router.push("/retry-wrong")} testID="row-retry-wrong" />
        <Row icon="albums" label="My Flashcards" onPress={() => router.push("/flashcards")} testID="row-flashcards" />
        <Row icon="trophy" label="Achievements" onPress={() => router.push("/achievements")} testID="row-achievements" />
        <Row icon="podium" label="Leaderboard" onPress={() => router.push("/leaderboard")} testID="row-leaderboard" />
        <Row icon="calendar" label="Study Plan" onPress={() => router.push("/study-plan")} testID="row-study-plan" />

        <Section title="Account" />
        <Row
          icon="location"
          label={user.state ? `State / Territory · ${user.state}` : "Set State / Territory"}
          onPress={() => router.push({ pathname: "/select-state", params: { from: "settings" } })}
          testID="row-change-state"
        />
        <Row icon="card" label="Subscription" onPress={() => router.push("/paywall")} testID="row-subscription" />
        {user.is_admin && (
          <Row icon="shield-checkmark" label="Admin Dashboard" onPress={() => router.push("/admin")} testID="row-admin" />
        )}

        <Section title="Legal & Privacy" />
        <Row icon="document-text" label="Terms of Service" onPress={() => router.push("/terms")} testID="row-terms" />
        <Row icon="cash" label="Refund Policy" onPress={() => router.push("/refund-policy")} testID="row-refund" />
        <Row icon="shield-half" label="Privacy Policy" onPress={() => router.push("/privacy")} testID="row-privacy" />
        <Row icon="lock-closed" label="Security Policy" onPress={() => router.push("/security")} testID="row-security" />
        <Row icon="warning" label="Disclaimer" onPress={() => router.push("/disclaimer")} testID="row-disclaimer" />
        <Row icon="information-circle" label="About Passaroo" onPress={() => router.push("/about")} testID="row-about" />

        <PButton
          title="Sign Out"
          variant="secondary"
          onPress={() => { signOut(); router.replace("/onboarding"); }}
          testID="signout-btn"
        />
        <PButton
          title={deleting ? "Deleting..." : "Delete My Account & Data"}
          variant="danger"
          onPress={confirmDelete}
          loading={deleting}
          testID="delete-account-btn"
        />

        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title }: { title: string }) {
  return <Text style={styles.section}>{title}</Text>;
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
    case "premium": return { backgroundColor: colors.premium };
    case "pro": return { backgroundColor: "#0A2A33" };
    default: return { backgroundColor: colors.bgAlt };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 80 },
  header: { alignItems: "center", paddingVertical: spacing.lg },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: colors.primary },
  name: { ...typography.h2, marginTop: spacing.md },
  email: { ...typography.caption, marginTop: 2 },
  planBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, marginTop: spacing.md },
  planText: { color: "#fff", fontWeight: "800", letterSpacing: 1 },
  section: { ...typography.caption, fontWeight: "800", letterSpacing: 1, marginTop: spacing.md, marginBottom: 4 },
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
