import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppButton,
  AppIcon,
  AppScreen,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  appColors,
} from "../components/common/designSystem";
import { getErrorMessage, getStoredUser } from "../services/authService";
import { buildSosRequestPayload, fetchSosHistory, getSosStatusLabel, mergeSosEvents, normalizeSosEvent, normalizeSosHistory, triggerSosRequest } from "../services/sosService";

export default function SosScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [events, setEvents] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const storedUser = await getStoredUser();
      if (mounted) {
        setCurrentUser(storedUser);
      }
    };

    void loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setLoading(true);
    }
    setError("");

    try {
      const res = await fetchSosHistory();
      const historyEvents = normalizeSosHistory(Array.isArray(res?.data) ? res.data : []);
      setEvents(historyEvents);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (!isRefresh) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const runLoad = async () => {
      if (mounted) {
        await loadEvents();
      }
    };

    void runLoad();

    return () => {
      mounted = false;
    };
  }, [loadEvents]);

  const handleSendSos = async () => {
    const role = currentUser?.role?.toUpperCase();

    if (role !== "RESIDENT") {
      const message = "SOS alerts are available for resident accounts only.";
      setError(message);
      setStatusMessage(message);
      Alert.alert("Access restricted", message);
      return;
    }

    setSending(true);
    setError("");
    setStatusMessage("Sending SOS alert...");

    try {
      const payload = buildSosRequestPayload("Emergency alert triggered from mobile app", "UNKNOWN");
      const response = await triggerSosRequest(payload);
      const createdEvent = normalizeSosEvent(response?.data || {});
      setEvents((prev) => mergeSosEvents(createdEvent, prev));
      setStatusMessage(response?.data?.message || "SOS sent successfully.");
      await loadEvents(true);
      Alert.alert("SOS sent", "Your emergency alert has been sent successfully.");
      await loadEvents(true);
    } catch (err) {
      const message = err?.response?.status === 403
        ? "Your account is not permitted to send SOS alerts right now."
        : getErrorMessage(err);
      setError(message);
      setStatusMessage(`SOS send failed: ${message}`);
      Alert.alert("SOS failed", message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AppScreen scrollable>
      <PageHeader
        eyebrow="Emergency response"
        title="SOS center"
        subtitle="Reach out for help quickly and review nearby alerts."
      />

      <SectionCard title="Urgent help" subtitle="Trigger a community alert in seconds" style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIconWrap}>
            <AppIcon name="warning-outline" size={28} color={appColors.red} />
          </View>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>Need urgent help?</Text>
            <Text style={styles.heroText}>Press the button below to trigger an SOS alert with your current status.</Text>
          </View>
        </View>

        <View style={styles.sosButtonWrap}>
          <AppButton
            title={sending ? "Sending…" : "Send SOS"}
            onPress={handleSendSos}
            disabled={sending || currentUser?.role?.toUpperCase() !== "RESIDENT"}
            loading={sending}
            variant="danger"
            style={styles.sosButton}
            textStyle={styles.sosButtonText}
          />
        </View>

        {statusMessage ? <StatusBadge label={statusMessage} tone={error ? "danger" : "success"} style={styles.statusBadge} /> : null}
        {currentUser ? (
          currentUser?.role?.toUpperCase() !== "RESIDENT" ? (
            <Text style={styles.helper}>SOS alerts are available for resident accounts only.</Text>
          ) : null
        ) : (
          <Text style={styles.helper}>Loading user details...</Text>
        )}
      </SectionCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionCard title="Recent alerts" subtitle={`Loaded alerts: ${events.length}`} style={styles.cardSpacing}>
        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : events.length === 0 ? (
          <EmptyState title="No SOS activity yet" message="Recent alerts will appear here as they are created." icon="time-outline" />
        ) : (
          events.map((item) => (
            <View key={item.id || `${item.status}-${item.created_at}`} style={styles.eventItem}>
              <View style={styles.eventHeader}>
                <StatusBadge label={getSosStatusLabel(item.status)} tone={item.status === "RESOLVED" ? "success" : item.status === "PENDING" ? "warning" : "danger"} compact />
                <Text style={styles.eventTime}>{item.created_at || "Recently created"}</Text>
              </View>
              <Text style={styles.eventMessage}>{item.message || "Emergency alert"}</Text>
              <Text style={styles.helper}>{item.location || "Location unavailable"}</Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Need to return?" subtitle="Jump back to your dashboard at any time." style={styles.cardSpacing}>
        <AppButton title="Back to dashboard" onPress={() => router.replace("/dashboard")} variant="secondary" />
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: { marginBottom: 14 },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  heroIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fef2f2", justifyContent: "center", alignItems: "center", marginRight: 12 },
  heroTextWrap: { flex: 1 },
  heroTitle: { fontSize: 20, fontWeight: "800", color: appColors.red, marginBottom: 4 },
  heroText: { fontSize: 14, color: appColors.slate, lineHeight: 20 },
  sosButtonWrap: { alignItems: "center", justifyContent: "center", marginTop: 8, marginBottom: 4 },
  sosButton: {
    marginTop: 4,
    width: 170,
    height: 170,
    borderRadius: 85,
    alignSelf: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: appColors.red,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  sosButtonText: { fontSize: 16, textAlign: "center" },
  statusBadge: { marginTop: 10 },
  loader: { marginTop: 10 },
  cardSpacing: { marginBottom: 14 },
  helper: { color: appColors.slate, marginTop: 6, lineHeight: 20 },
  error: { color: appColors.red, marginBottom: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: "#fef2f2" },
  eventItem: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 12, marginTop: 10, backgroundColor: "#fafcff" },
  eventHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  eventTime: { color: appColors.muted, fontSize: 12 },
  eventMessage: { fontWeight: "700", color: appColors.navy, marginBottom: 4 },
});
