// AI Tutor chat screen (Premium feature).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, IMAGES, radius, spacing, typography } from "@/src/theme";

type Msg = { id: string; role: "user" | "ai"; text: string };

export default function Tutor() {
  const router = useRouter();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "ai",
      text:
        "G'day! I'm Passaroo, your AI exam tutor. Ask me about Australian road rules, citizenship, RSA — or anything you're stuck on.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId] = useState(`tutor_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const listRef = useRef<FlatList<Msg> | null>(null);

  const canUseTutor = user?.plan === "premium" || user?.plan === "pro";

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setMessages((m) => [...m, { id: `u_${Date.now()}`, role: "user", text }]);
    setInput("");
    setSending(true);
    try {
      const r = await api<{ reply: string }>("/ai/tutor", {
        method: "POST",
        body: { session_id: sessionId, message: text },
      });
      setMessages((m) => [...m, { id: `a_${Date.now()}`, role: "ai", text: r.reply }]);
    } catch (e: any) {
      setMessages((m) => [...m, { id: `e_${Date.now()}`, role: "ai", text: `⚠️ ${e.message}` }]);
    } finally {
      setSending(false);
    }
  };

  if (!canUseTutor) {
    return (
      <SafeAreaView style={styles.lockContainer} edges={["top"]} testID="tutor-locked">
        <Image source={{ uri: IMAGES.mascot }} style={{ width: 160, height: 160 }} resizeMode="contain" />
        <Text style={styles.lockTitle}>AI Tutor is a Premium feature</Text>
        <Text style={styles.lockSub}>
          Unlock unlimited chats with Passaroo to break down tricky questions and accelerate your study.
        </Text>
        <TouchableOpacity
          style={styles.lockBtn}
          onPress={() => router.push("/paywall")}
          testID="tutor-upgrade"
        >
          <Text style={styles.lockBtnText}>Upgrade to Premium</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="tutor-screen">
      <View style={styles.header}>
        <Image source={{ uri: IMAGES.mascot }} style={styles.avatar} resizeMode="contain" />
        <View>
          <Text style={styles.headerTitle}>Passaroo AI Tutor</Text>
          <Text style={styles.headerSub}>Powered by AI · Educational use only</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          renderItem={({ item }) => (
            <View
              testID={`msg-${item.role}`}
              style={[
                styles.bubble,
                item.role === "user" ? styles.bubbleUser : styles.bubbleAi,
              ]}
            >
              <Text style={item.role === "user" ? styles.bubbleUserText : styles.bubbleAiText}>
                {item.text}
              </Text>
            </View>
          )}
        />

        <View style={styles.inputBar}>
          <TextInput
            testID="tutor-input"
            value={input}
            onChangeText={setInput}
            placeholder="Ask Passaroo anything…"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            onPress={send}
            disabled={sending || !input.trim()}
            style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
            testID="tutor-send"
          >
            <Ionicons name="send" size={20} color="#0A2A33" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: 2, borderBottomColor: colors.border,
  },
  avatar: { width: 44, height: 44 },
  headerTitle: { ...typography.h3, fontSize: 18 },
  headerSub: { ...typography.caption, fontSize: 12 },
  bubble: {
    maxWidth: "85%",
    padding: 12, borderRadius: radius.lg, borderWidth: 2,
  },
  bubbleUser: {
    alignSelf: "flex-end", backgroundColor: colors.primary,
    borderColor: colors.primaryDark, borderBottomRightRadius: 4,
  },
  bubbleAi: {
    alignSelf: "flex-start", backgroundColor: "#fff",
    borderColor: colors.border, borderBottomLeftRadius: 4,
  },
  bubbleUserText: { color: "#0A2A33", fontWeight: "600", fontSize: 15 },
  bubbleAiText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  inputBar: {
    flexDirection: "row", padding: spacing.sm, gap: spacing.sm,
    borderTopWidth: 2, borderTopColor: colors.border, backgroundColor: "#fff",
    alignItems: "flex-end",
  },
  input: {
    flex: 1, backgroundColor: colors.bgAlt, borderRadius: radius.lg,
    padding: 12, maxHeight: 100, fontSize: 15, color: colors.textPrimary,
    borderWidth: 2, borderColor: colors.border,
  },
  sendBtn: {
    backgroundColor: colors.primaryGreen, borderRadius: radius.lg,
    width: 50, height: 50, alignItems: "center", justifyContent: "center",
    borderBottomWidth: 3, borderBottomColor: colors.primaryGreenDark,
  },
  lockContainer: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md,
  },
  lockTitle: { ...typography.h2, textAlign: "center", marginTop: spacing.md },
  lockSub: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  lockBtn: {
    backgroundColor: colors.premium, paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: radius.lg, borderBottomWidth: 4, borderBottomColor: "#5A45CC", marginTop: spacing.md,
  },
  lockBtnText: { color: "#fff", fontWeight: "800", letterSpacing: 1 },
});
