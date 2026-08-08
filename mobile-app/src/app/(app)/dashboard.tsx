import React, { useEffect, useState } from "react";
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppIcon, AppScreen, PageHeader, SectionCard, StatusBadge, AppButton, appColors } from "../../components/common/designSystem";
import SosWorkflowWizard from "../../components/sos/SosWorkflowWizard";
import { getStoredUser } from "../../services/authService";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [pulseScale] = useState(new Animated.Value(1));
  const [pulseOpacity] = useState(new Animated.Value(0.35));

  useEffect(() => {
    const loadUser = async () => {
      const storedUser = await getStoredUser();
      setUser(storedUser);
    };

    void loadUser();
  }, []);

  useEffect(() => {
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.08, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ])
    );
    const opacityLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    );

    scaleLoop.start();
    opacityLoop.start();

    return () => {
      scaleLoop.stop();
      opacityLoop.stop();
    };
  }, [pulseOpacity, pulseScale]);

  const refreshResidentContext = async () => {
    setUser(await getStoredUser());
  };

  const isResident = user?.role === "RESIDENT";
  const locationLabel = user?.society && user?.flat ? `${user.society} • Flat ${user.flat}` : user?.society || user?.flat || "Location unavailable";

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  if (showWizard) {
    return (
      <AppScreen scrollable={true}>
        <PageHeader
          eyebrow="Emergency SOS"
          title="Safety Alert"
          subtitle="Guided emergency request"
        />
        <SosWorkflowWizard user={user} onClose={() => setShowWizard(false)} />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Emergency dashboard"
        title={`${getGreeting()}, ${user?.username || "resident"}`}
        subtitle="Your safety tools are ready when you need them."
        action={<StatusBadge label="Live" tone="success" compact />}
      />

      <SectionCard style={styles.summaryCard}>
        <View style={styles.summaryTopRow}>
          <View style={styles.summaryTextWrap}>
            <Text style={styles.greetingText}>Hello, {user?.username || "resident"}</Text>
            <Text style={styles.nameText}>{user?.username || "Resident"}</Text>
            <Text style={styles.metaText}>{user?.society || "Society not available"} • {user?.flat || "Flat not available"}</Text>
          </View>
          <Pressable style={styles.callButton} onPress={() => Linking.openURL("tel:112")}>
            <AppIcon name="warning-outline" size={16} color={appColors.white} />
          </Pressable>
        </View>
      </SectionCard>

      <View style={styles.sosButtonContainer}>
        {isResident ? (
          <>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
            <Pressable style={styles.sosButton} onPress={() => setShowWizard(true)}>
              <Text style={styles.sosButtonText}>SOS</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={[styles.sosButton, styles.sosButtonDisabled]} disabled>
              <Text style={styles.sosButtonText}>SOS</Text>
            </Pressable>
            <Text style={styles.sosButtonDisabledLabel}>Residents Only</Text>
            <Text style={styles.sosButtonHelperText}>Only residents can create SOS incidents. Security and Admin can monitor and manage existing incidents.</Text>
          </>
        )}
      </View>

      <SectionCard title="Location" subtitle="Your current residence context" style={styles.locationCard}>
        <View style={styles.locationRow}>
          <View style={styles.locationTextWrap}>
            <Text style={styles.locationLabel}>Current location</Text>
            <Text style={styles.locationValue}>{locationLabel}</Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={refreshResidentContext}>
            <AppIcon name="time-outline" size={16} color={appColors.blue} />
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard title="Contacts" subtitle="Browse society members and emergency contacts">
        <AppButton title="Open contact directory" onPress={() => router.push("/contact-directory")} />
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sosButtonContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  pulseRing: { position: "absolute", width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: "#E53935", opacity: 0.2 },
  sosButton: { width: 130, height: 130, borderRadius: 65, backgroundColor: "#E53935", alignItems: "center", justifyContent: "center", shadowColor: "#E53935", shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  sosButtonText: { color: appColors.white, fontSize: 32, fontWeight: "800" },
  sosButtonDisabled: { backgroundColor: "#D0D0D0", shadowOpacity: 0.15, elevation: 5 },
  sosButtonDisabledLabel: { marginTop: 12, fontSize: 14, fontWeight: "700", color: appColors.slate, textAlign: "center" },
  sosButtonHelperText: { marginTop: 8, fontSize: 12, color: appColors.muted, textAlign: "center", lineHeight: 18, maxWidth: 280 },
  summaryCard: { marginBottom: 14 },
  summaryTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTextWrap: { flex: 1 },
  greetingText: { fontSize: 15, fontWeight: "700", color: appColors.navy },
  nameText: { fontSize: 20, fontWeight: "800", color: appColors.navy, marginTop: 2 },
  metaText: { color: appColors.slate, marginTop: 6, lineHeight: 20 },
  callButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: appColors.red, justifyContent: "center", alignItems: "center", marginLeft: 12 },
  categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  categoryOption: { borderWidth: 1, borderColor: appColors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: appColors.white },
  categoryOptionSelected: { borderColor: appColors.blue, backgroundColor: appColors.blueSoft },
  categoryOptionText: { color: appColors.slate, fontSize: 13, fontWeight: "700" },
  categoryOptionTextSelected: { color: appColors.blue },
  prioritySection: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 12, marginBottom: 12, backgroundColor: appColors.white },
  priorityWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  priorityOption: { borderWidth: 1, borderColor: appColors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: appColors.white },
  priorityOptionSelected: { borderColor: appColors.blue, backgroundColor: appColors.blueSoft },
  priorityOptionText: { color: appColors.slate, fontSize: 13, fontWeight: "700" },
  priorityOptionTextSelected: { color: appColors.blue },
  descriptionSection: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 12, marginBottom: 12, backgroundColor: appColors.white },
  descriptionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  descriptionLabel: { color: appColors.navy, fontSize: 13, fontWeight: "700" },
  voiceButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center" },
  voiceButtonDisabled: { backgroundColor: appColors.grayLight, opacity: 0.65 },
  voiceButtonActive: { backgroundColor: appColors.red, borderWidth: 1, borderColor: appColors.redSoft },
  descriptionInput: { borderWidth: 1, borderColor: appColors.border, borderRadius: 12, minHeight: 96, paddingHorizontal: 12, paddingVertical: 10, color: appColors.navy, fontSize: 14, backgroundColor: appColors.white },
  descriptionFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  voiceStatusText: { color: appColors.red, fontSize: 12, flex: 1 },
  descriptionCounter: { color: appColors.muted, fontSize: 12, marginTop: 6, textAlign: "right" },

  confirmationBox: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: appColors.greenSoft },
  confirmationText: { color: appColors.navy, marginTop: 8, lineHeight: 20 },
  confirmationMeta: { color: appColors.muted, marginTop: 4, fontSize: 12 },
  statusWrap: { marginTop: 12 },
  errorText: { color: appColors.red, marginTop: 10, lineHeight: 20 },
  locationCard: { marginBottom: 0 },
  locationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  locationTextWrap: { flex: 1 },
  locationLabel: { color: appColors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  locationValue: { color: appColors.navy, fontSize: 16, fontWeight: "700" },
  refreshButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center", marginLeft: 12 },
});