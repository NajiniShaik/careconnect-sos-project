import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppButton, AppIcon, AppScreen, PageHeader, SectionCard, StatusBadge, appColors } from "../components/common/designSystem";
import { clearAuth, getStoredUser } from "../services/authService";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      setUser(await getStoredUser());
    };

    void loadUser();
  }, []);

  const logout = async () => {
    await clearAuth();
    router.replace("/");
  };

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Emergency dashboard"
        title={`Welcome, ${user?.username || "resident"}`}
        subtitle="Your safety tools and emergency resources live here."
        action={<StatusBadge label="Live" tone="success" compact />}
      />

      <SectionCard title="At a glance" subtitle="Quick access to the most important actions" style={styles.heroSection}>
        <View style={styles.heroRow}>
          <View style={styles.heroIconWrap}>
            <AppIcon name="shield-checkmark-outline" size={24} color={appColors.blue} />
          </View>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>Community safety is ready</Text>
            <Text style={styles.heroText}>Reach emergency help, review your profile, and manage your address from one secure place.</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Quick actions" subtitle="Choose the next step" style={styles.cardSpacing}>
        <AppButton title="Send SOS" onPress={() => router.push("/sos")} icon="warning-outline" style={styles.actionButton} />
        <AppButton title="Open profile" onPress={() => router.push("/profile")} icon="person-outline" variant="secondary" style={styles.actionButton} />
        <AppButton title="Residence setup" onPress={() => router.push("/society-setup")} icon="home-outline" variant="secondary" style={styles.actionButton} />
      </SectionCard>

      <SectionCard title="Account details" subtitle="Current session summary" style={styles.cardSpacing}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role</Text>
          <Text style={styles.infoValue}>{user?.role || "Unknown"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user?.email || "Not available"}</Text>
        </View>
      </SectionCard>

      <SectionCard title="Need a break?" subtitle="Sign out when you are done." style={styles.cardSpacing}>
        <AppButton title="Logout" onPress={logout} variant="danger" />
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroSection: { marginBottom: 14 },
  heroRow: { flexDirection: "row", alignItems: "flex-start" },
  heroIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center", marginRight: 12 },
  heroTextWrap: { flex: 1 },
  heroTitle: { fontSize: 18, fontWeight: "800", color: appColors.navy, marginBottom: 4 },
  heroText: { color: appColors.slate, lineHeight: 20 },
  cardSpacing: { marginBottom: 14 },
  actionButton: { marginBottom: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: appColors.border },
  infoLabel: { fontWeight: "700", color: appColors.slate },
  infoValue: { flex: 1, textAlign: "right", color: appColors.navy, marginLeft: 8 },
});