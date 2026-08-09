import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { useRouter } from "expo-router";
import {
  AppButton,
  AppScreen,
  AppIcon,
  PageHeader,
  SectionCard,
  appColors,
} from "../components/common/designSystem";

const features = [
  { label: "Emergency SOS", icon: "alert-circle-outline", description: "Trigger and manage urgent alerts across your community." },
  { label: "Community connection", icon: "people-outline", description: "Keep residents and guardians connected with every incident." },
  { label: "Emergency contacts", icon: "contact-outline", description: "Store and access critical contact info when it matters most." },
  { label: "Security & response", icon: "shield-outline", description: "Coordinate security teams with fast incident handoff and updates." },
  { label: "Notifications", icon: "notifications-outline", description: "Deliver timely alerts through SMS, email, and in-app messages." },
];

export default function LandingScreen() {
  const router = useRouter();

  return (
    <AppScreen background="brand">
      <View style={styles.heroSection}>
        <View style={styles.heroText}>
          <Text style={styles.heroEyebrow}>CareConnect</Text>
          <Text style={styles.heroTitle}>Welcome to the community safety platform.</Text>
          <Text style={styles.heroSubtitle}>
            CareConnect brings residents, volunteers, security teams and administrators together in one modern emergency management experience.
          </Text>

          <View style={styles.actionRow}>
            <AppButton title="Login" onPress={() => router.push("/login")} style={styles.primaryButton} />
            <AppButton title="Create Account" variant="secondary" onPress={() => router.push("/register")} style={styles.secondaryButton} />
          </View>
        </View>
      </View>

      <View style={styles.featuresSection}>
        <Text style={styles.sectionHeading}>Platform highlights</Text>
        <View style={styles.featureGrid}>
          {features.map((feature) => (
            <View key={feature.label} style={styles.featureCard}>
              <View style={styles.featureIcon}>
                <AppIcon name={feature.icon} size={20} color={appColors.blue} />
              </View>
              <Text style={styles.featureTitle}>{feature.label}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </View>
          ))}
        </View>
      </View>

      <SectionCard title="Ready to get started" subtitle="Login or create your account to access the full platform." style={styles.footerCard}>
        <View style={styles.footerButtons}>
          <AppButton title="Login" onPress={() => router.push("/login")} />
          <AppButton title="Create Account" variant="secondary" onPress={() => router.push("/register")} />
        </View>
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroSection: {
    marginBottom: 20,
  },
  heroText: {
    paddingVertical: 16,
  },
  heroEyebrow: {
    color: appColors.blue,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: appColors.navy,
    marginBottom: 14,
    lineHeight: 40,
  },
  heroSubtitle: {
    color: appColors.slate,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
    maxWidth: 600,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  primaryButton: {
    minWidth: 150,
  },
  secondaryButton: {
    minWidth: 150,
  },
  featuresSection: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: "800",
    color: appColors.navy,
    marginBottom: 14,
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "space-between",
  },
  featureCard: {
    flexBasis: "48%",
    backgroundColor: appColors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: appColors.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: appColors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: appColors.blueSoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: appColors.navy,
    marginBottom: 8,
  },
  featureDescription: {
    color: appColors.slate,
    fontSize: 14,
    lineHeight: 20,
  },
  footerCard: {
    marginBottom: 8,
  },
  footerButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },
});
