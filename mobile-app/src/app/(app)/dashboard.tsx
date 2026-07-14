import React, { useEffect, useState } from "react";
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon, AppScreen, PageHeader, SectionCard, StatusBadge, appColors } from "../../components/common/designSystem";
import { getErrorMessage, getStoredUser } from "../../services/authService";
import { buildSosRequestPayload, triggerSosRequest } from "../../services/sosService";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [sosError, setSosError] = useState("");
  const [pulseScale] = useState(new Animated.Value(1));
  const [pulseOpacity] = useState(new Animated.Value(0.35));

  useEffect(() => {
    const loadUser = async () => {
      setUser(await getStoredUser());
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

  const handleSendSos = async () => {
    const role = user?.role?.toUpperCase();

    if (role !== "RESIDENT") {
      const message = "SOS alerts are available for resident accounts only.";
      setSosError(message);
      setStatusMessage(message);
      return;
    }

    setSending(true);
    setSosError("");
    setStatusMessage("Sending SOS alert...");

    try {
      const payload = buildSosRequestPayload("Emergency alert triggered from mobile app", "UNKNOWN");
      const response = await triggerSosRequest(payload);
      setStatusMessage(response?.data?.message || "SOS sent successfully.");
    } catch (err) {
      const message = getErrorMessage(err);
      setSosError(message);
      setStatusMessage(`SOS send failed: ${message}`);
    } finally {
      setSending(false);
    }
  };

  const locationLabel = user?.society && user?.flat ? `${user.society} • Flat ${user.flat}` : user?.society || user?.flat || "Location unavailable";

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

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

      <SectionCard title="SOS center" subtitle="Press the button below for urgent help" style={styles.sosCard}>
        <View style={styles.sosButtonWrap}>
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
          <Pressable style={styles.sosButton} onPress={handleSendSos} disabled={sending || user?.role?.toUpperCase() !== "RESIDENT"}>
            <AppIcon name="warning-outline" size={34} color={appColors.white} />
            <Text style={styles.sosButtonText}>{sending ? "Sending…" : "SOS"}</Text>
          </Pressable>
        </View>

        {statusMessage ? (
          <View style={styles.statusWrap}>
            <StatusBadge label={statusMessage} tone={sosError ? "danger" : "success"} compact />
          </View>
        ) : null}
        {sosError ? <Text style={styles.errorText}>{sosError}</Text> : null}
      </SectionCard>

      <SectionCard title="What happens after pressing SOS?" subtitle="Your support network is notified quickly." style={styles.infoCard}>
        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppIcon name="shield-checkmark-outline" size={16} color={appColors.blue} />
            <Text style={styles.infoText}>Security is notified</Text>
          </View>
          <View style={styles.infoRow}>
            <AppIcon name="shield-outline" size={16} color={appColors.blue} />
            <Text style={styles.infoText}>Admin is notified</Text>
          </View>
          <View style={styles.infoRow}>
            <AppIcon name="people-outline" size={16} color={appColors.blue} />
            <Text style={styles.infoText}>Emergency contacts are notified</Text>
          </View>
          <View style={styles.infoRow}>
            <AppIcon name="home-outline" size={16} color={appColors.blue} />
            <Text style={styles.infoText}>Location is shared when enabled</Text>
          </View>
        </View>
      </SectionCard>

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
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summaryCard: { marginBottom: 14 },
  summaryTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTextWrap: { flex: 1 },
  greetingText: { fontSize: 15, fontWeight: "700", color: appColors.navy },
  nameText: { fontSize: 20, fontWeight: "800", color: appColors.navy, marginTop: 2 },
  metaText: { color: appColors.slate, marginTop: 6, lineHeight: 20 },
  callButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: appColors.red, justifyContent: "center", alignItems: "center", marginLeft: 12 },
  sosCard: { marginBottom: 14 },
  sosButtonWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  pulseRing: { position: "absolute", width: 188, height: 188, borderRadius: 94, borderWidth: 2, borderColor: appColors.redSoft },
  sosButton: { width: 170, height: 170, borderRadius: 85, backgroundColor: appColors.red, alignItems: "center", justifyContent: "center", shadowColor: appColors.red, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  sosButtonText: { color: appColors.white, fontSize: 20, fontWeight: "800", marginTop: 6 },
  statusWrap: { marginTop: 12 },
  errorText: { color: appColors.red, marginTop: 10, lineHeight: 20 },
  infoCard: { marginBottom: 14 },
  infoList: { gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  infoText: { color: appColors.slate, fontSize: 14, flex: 1 },
  locationCard: { marginBottom: 0 },
  locationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  locationTextWrap: { flex: 1 },
  locationLabel: { color: appColors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  locationValue: { color: appColors.navy, fontSize: 16, fontWeight: "700" },
  refreshButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center", marginLeft: 12 },
});