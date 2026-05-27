// Login + Signup screen — email/password + Google.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { PButton } from "@/src/components/PButton";
import { colors, DISCLAIMER, IMAGES, radius, spacing, typography } from "@/src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { signInEmail, signUpEmail, signInGoogle, signInApple, signInMicrosoft } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please tell us your name");
      return;
    }
    setLoading("email");
    try {
      if (mode === "signup") {
        await signUpEmail(email.trim(), password, name.trim());
      } else {
        await signInEmail(email.trim(), password);
      }
      router.replace("/");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const runOAuth = async (kind: "google" | "apple" | "microsoft", fn: () => Promise<void>) => {
    setError(null);
    setLoading(kind);
    try {
      await fn();
      router.replace("/");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };
  const onGoogle = () => runOAuth("google", signInGoogle);
  const onApple = () => runOAuth("apple", signInApple);
  const onMicrosoft = () => runOAuth("microsoft", signInMicrosoft);
  const isApple = Platform.OS === "ios";

  return (
    <SafeAreaView style={styles.container} testID="login-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Image source={{ uri: IMAGES.mascot }} style={styles.mascot} resizeMode="contain" />
            <Text style={styles.title}>{mode === "signin" ? "Welcome back!" : "Join Passaroo"}</Text>
            <Text style={styles.subtitle}>
              {mode === "signin"
                ? "Sign in to continue your study streak."
                : "Create an account and start your exam prep today."}
            </Text>
          </View>

          {mode === "signup" && (
            <TextInput
              testID="signup-name"
              placeholder="Full name"
              value={name}
              onChangeText={setName}
              style={styles.input}
              autoCapitalize="words"
              placeholderTextColor={colors.textTertiary}
            />
          )}
          <TextInput
            testID="auth-email"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={styles.input}
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            testID="auth-password"
            placeholder="Password (min 6 chars)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            placeholderTextColor={colors.textTertiary}
          />

          {error && <Text style={styles.error} testID="auth-error">{error}</Text>}

          <PButton
            title={mode === "signin" ? "Sign In" : "Create Account"}
            onPress={submit}
            loading={loading === "email"}
            testID="auth-submit"
          />

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.line} />
          </View>

          <TouchableOpacity
            testID="auth-google"
            style={styles.oauthBtn}
            onPress={onGoogle}
            activeOpacity={0.85}
            disabled={loading !== null}
          >
            <Ionicons name="logo-google" size={22} color="#EA4335" />
            <Text style={styles.oauthText}>
              {loading === "google" ? "Signing in..." : "Continue with Google"}
            </Text>
          </TouchableOpacity>

          {isApple && (
            <AppleAuthentication.AppleAuthenticationButton
              testID="auth-apple"
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={16}
              style={{ height: 50, marginTop: 12 }}
              onPress={onApple}
            />
          )}

          <TouchableOpacity
            testID="auth-microsoft"
            style={[styles.oauthBtn, { marginTop: 12, backgroundColor: "#2F2F2F", borderColor: "#2F2F2F" }]}
            onPress={onMicrosoft}
            activeOpacity={0.85}
            disabled={loading !== null}
          >
            <Ionicons name="logo-microsoft" size={22} color="#fff" />
            <Text style={[styles.oauthText, { color: "#fff" }]}>
              {loading === "microsoft" ? "Signing in..." : "Continue with Microsoft"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="auth-toggle"
            onPress={() => {
              setMode((m) => (m === "signin" ? "signup" : "signin"));
              setError(null);
            }}
            style={{ marginTop: spacing.lg, alignItems: "center" }}
          >
            <Text style={styles.toggleText}>
              {mode === "signin"
                ? "New here? Create an account →"
                : "Already have an account? Sign in →"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingBottom: 48 },
  header: { alignItems: "center", marginBottom: spacing.lg },
  mascot: { width: 120, height: 120, marginBottom: spacing.sm },
  title: { ...typography.h1, textAlign: "center" },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: 4 },
  input: {
    backgroundColor: colors.bgAlt,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: "600",
    marginBottom: 12,
  },
  error: { color: colors.wrong, fontWeight: "600", textAlign: "center", marginBottom: 12 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg, gap: 12 },
  line: { flex: 1, height: 2, backgroundColor: colors.border },
  dividerText: { ...typography.caption, fontWeight: "800", color: colors.textSecondary },
  oauthBtn: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 4,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  oauthText: { ...typography.bodyLarge, fontWeight: "700" },
  toggleText: { color: colors.primaryDark, fontWeight: "700", fontSize: 15 },
  disclaimer: {
    ...typography.caption,
    textAlign: "center",
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: spacing.xl,
  },
});
