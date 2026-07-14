import React from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export const appColors = {
  navy: "#0f172a",
  slate: "#334155",
  blue: "#2563eb",
  blueSoft: "#dbeafe",
  red: "#dc2626",
  redSoft: "#fee2e2",
  amber: "#d97706",
  amberSoft: "#fef3c7",
  green: "#15803d",
  greenSoft: "#dcfce7",
  white: "#ffffff",
  mist: "#f8fafc",
  border: "#e2e8f0",
  muted: "#64748b",
  shadow: "rgba(15, 23, 42, 0.12)",
};

export const appRadius = {
  sm: 10,
  md: 16,
  lg: 22,
};

const iconMap = {
  "home-outline": "🏠",
  "people-outline": "👥",
  "shield-outline": "🛡️",
  "settings-outline": "⚙️",
  "warning-outline": "⚠️",
  "person-outline": "👤",
  "sparkles-outline": "✨",
  "time-outline": "⏱️",
  "shield-checkmark-outline": "🛡️",
  "hand-left-outline": "🤝",
};

export function AppIcon({ name, size = 18, color = appColors.blue }) {
  const glyph = iconMap[name] || "•";
  return <Text style={{ fontSize: size, color, lineHeight: size }}>{glyph}</Text>;
}

export function AppScreen({ children, contentStyle, scrollable = true, background = "default" }) {
  const containerStyle = background === "brand" ? styles.brandScreen : styles.screen;

  return (
    <SafeAreaView style={styles.safeArea}>
      {scrollable ? (
        <ScrollView
          style={containerStyle}
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[containerStyle, styles.content, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function PageHeader({ title, subtitle, eyebrow, action }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerTextWrap}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
}

export function SectionCard({ children, title, subtitle, icon, action, style }) {
  return (
    <View style={[styles.card, style]}>
      {(title || subtitle || icon || action) && (
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            {icon ? (
              <View style={styles.iconBadge}>
                <AppIcon name={icon} size={18} color={appColors.blue} />
              </View>
            ) : null}
            <View>
              {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
              {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
            </View>
          </View>
          {action ? <View>{action}</View> : null}
        </View>
      )}
      {children}
    </View>
  );
}

export function AppButton({ title, onPress, variant = "primary", disabled = false, loading = false, style, textStyle, icon }) {
  const isSecondary = variant === "secondary";
  const isGhost = variant === "ghost";
  const isDanger = variant === "danger";

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        isSecondary && styles.secondaryButton,
        isGhost && styles.ghostButton,
        isDanger && styles.dangerButton,
        (disabled || loading) && styles.disabledButton,
        pressed && !disabled && !loading && styles.buttonPressed,
        style,
      ]}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={isGhost ? appColors.blue : appColors.white} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <AppIcon name={icon} size={18} color={isGhost ? appColors.blue : appColors.white} /> : null}
          <Text style={[styles.buttonText, isGhost && styles.ghostButtonText, isSecondary && styles.secondaryButtonText, isDanger && styles.dangerButtonText, textStyle]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function AppTextInput({ label, error, ...props }) {
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        style={[styles.textInput, error ? styles.textInputError : null]}
        placeholderTextColor={appColors.muted}
        {...props}
      />
      {error ? <Text style={styles.inputError}>{error}</Text> : null}
    </View>
  );
}

export function StatusBadge({ label, tone = "neutral", compact = false }) {
  const toneStyle =
    tone === "success"
      ? styles.successBadge
      : tone === "danger"
        ? styles.dangerBadge
        : tone === "warning"
          ? styles.warningBadge
          : styles.neutralBadge;

  return (
    <View style={[styles.badge, toneStyle, compact && styles.compactBadge]}>
      <Text style={[styles.badgeText, tone === "neutral" && styles.neutralBadgeText]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, message, icon = "sparkles-outline", action }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <AppIcon name={icon} size={24} color={appColors.blue} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: appColors.mist },
  screen: { flex: 1, backgroundColor: appColors.mist },
  brandScreen: { flex: 1, backgroundColor: "#eef4ff" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  headerTextWrap: { flex: 1 },
  eyebrow: { color: appColors.blue, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 },
  pageTitle: { fontSize: 28, fontWeight: "800", color: appColors.navy },
  pageSubtitle: { marginTop: 6, color: appColors.slate, fontSize: 15, lineHeight: 22 },
  headerAction: { marginLeft: 12 },
  card: {
    backgroundColor: appColors.white,
    borderRadius: appRadius.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: appColors.border,
    shadowColor: appColors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: appColors.blueSoft,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: appColors.navy },
  cardSubtitle: { color: appColors.muted, marginTop: 2, fontSize: 13 },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: appRadius.md,
    backgroundColor: appColors.blue,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButton: { backgroundColor: appColors.blueSoft },
  ghostButton: { backgroundColor: "transparent", paddingHorizontal: 0, minHeight: 0 },
  dangerButton: { backgroundColor: appColors.red },
  disabledButton: { opacity: 0.6 },
  buttonPressed: { transform: [{ scale: 0.98 }] },
  buttonContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttonText: { color: appColors.white, fontSize: 15, fontWeight: "700" },
  secondaryButtonText: { color: appColors.blue },
  ghostButtonText: { color: appColors.blue },
  dangerButtonText: { color: appColors.white },
  inputWrap: { marginBottom: 10 },
  inputLabel: { color: appColors.navy, fontSize: 13, fontWeight: "700", marginBottom: 7 },
  textInput: {
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: appColors.white,
    borderRadius: appRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: appColors.navy,
    fontSize: 15,
  },
  textInputError: { borderColor: appColors.red },
  inputError: { color: appColors.red, marginTop: 6, fontSize: 12 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  compactBadge: { paddingVertical: 3, paddingHorizontal: 8 },
  successBadge: { backgroundColor: appColors.greenSoft },
  dangerBadge: { backgroundColor: appColors.redSoft },
  warningBadge: { backgroundColor: appColors.amberSoft },
  neutralBadge: { backgroundColor: appColors.blueSoft },
  badgeText: { fontSize: 12, fontWeight: "700", color: appColors.navy },
  neutralBadgeText: { color: appColors.blue },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 24, paddingHorizontal: 12 },
  emptyIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center", marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: appColors.navy, marginBottom: 4 },
  emptyMessage: { color: appColors.muted, textAlign: "center", lineHeight: 20 },
  emptyAction: { marginTop: 12 },
});
