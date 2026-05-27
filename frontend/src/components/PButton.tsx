// Reusable chunky-button primitive in Passaroo style.
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type ViewStyle } from "react-native";

import { colors, radius, typography } from "@/src/theme";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";

export function PButton({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  testID,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle | ViewStyle[];
}) {
  const v = variants[variant];
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.base, v.container, isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={v.text.color} />
      ) : (
        <Text style={[styles.text, v.text]} numberOfLines={1}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 4,
  },
  text: { ...typography.button },
  disabled: { opacity: 0.5 },
});

const variants: Record<Variant, { container: ViewStyle; text: any }> = {
  primary: {
    container: { backgroundColor: colors.primary, borderBottomColor: colors.primaryDark, borderWidth: 0 },
    text: { color: "#0A2A33" },
  },
  success: {
    container: { backgroundColor: colors.primaryGreen, borderBottomColor: colors.primaryGreenDark, borderWidth: 0 },
    text: { color: "#0A2D1F" },
  },
  secondary: {
    container: {
      backgroundColor: "#FFFFFF",
      borderWidth: 2,
      borderColor: colors.border,
      borderBottomColor: colors.border,
      borderBottomWidth: 4,
    },
    text: { color: colors.textPrimary },
  },
  danger: {
    container: { backgroundColor: colors.wrong, borderBottomColor: "#CC2A2A", borderWidth: 0 },
    text: { color: "#FFFFFF" },
  },
  ghost: {
    container: { backgroundColor: "transparent", borderBottomWidth: 0 },
    text: { color: colors.primaryDark },
  },
};
