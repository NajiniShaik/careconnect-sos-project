import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppButton, AppScreen, EmptyState, PageHeader, SectionCard, StatusBadge, appColors } from "../../components/common/designSystem";
import { api, getAuthHeaders, getStoredUser } from "../../services/authService";

const AVAILABILITY_ENDPOINT = "/volunteers/availability/";

function formatRelativeTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const delta = Math.floor((Date.now() - date.getTime()) / 1000);
  if (delta < 60) return "Just now";
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} hr ago`;
  return date.toLocaleDateString();
}

function formatUpdatedTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

function normalizeIncident(item) {
  const data = item?.data || {};
  const alertId = data?.alert_id || data?.alertId || data?.alertid || null;
  const rawStatus = data?.status || "Pending";

  return {
    id: item?.id || alertId || `${Date.now()}`,
    alertId,
    notificationId: item?.id || null,
    residentName: data?.resident_name || data?.residentName || item?.title?.replace("Community Broadcast", "").trim() || "Resident",
    society: data?.society_name || data?.societyName || "Unknown society",
    blockFlat: data?.block_flat || data?.blockFlat || data?.location || "Not provided",
    sosType: data?.sos_type || data?.sosType || data?.type || "Community broadcast",
    time: item?.received_at || item?.created_at || null,
    distance: data?.distance_meters != null ? `${Math.round(Number(data.distance_meters))} m` : data?.distance || null,
    status: rawStatus,
    message: item?.body || "Community broadcast incident",
  };
}

async function enrichIncidentWithSosDetails(incident) {
  if (!incident.alertId) {
    return incident;
  }

  try {
    const response = await api.get(`/sos/${incident.alertId}/`);
    const detail = response?.data || {};
    const residentName = detail?.user?.username || detail?.user?.email || incident.residentName;
    const locationText = detail?.address || detail?.location || detail?.city || incident.blockFlat;

    return {
      ...incident,
      residentName,
      society: detail?.city || detail?.state || incident.society,
      blockFlat: locationText || incident.blockFlat,
      sosType: detail?.category || incident.sosType,
      time: detail?.created_at || incident.time,
      status: detail?.status || incident.status,
      message: detail?.message || incident.message,
    };
  } catch {
    return incident;
  }
}

export default function VolunteerIncidentsRoute() {
  const router = useRouter();
  const [availability, setAvailability] = useState({ is_available: false, availability_updated_at: null });
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilityFeedback, setAvailabilityFeedback] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [acceptedIds, setAcceptedIds] = useState([]);
  const [userRole, setUserRole] = useState(null);

  const loadAvailability = useCallback(async () => {
    try {
      setLoadingAvailability(true);
      const authHeaders = await getAuthHeaders();
      console.log("[volunteer availability] GET", {
        url: AVAILABILITY_ENDPOINT,
        method: "GET",
        authorization: authHeaders.Authorization ? "Bearer [present]" : "missing",
      });
      const response = await api.get(AVAILABILITY_ENDPOINT);
      setAvailability(response?.data || { is_available: false, availability_updated_at: null });
    } catch (error) {
      console.log("[volunteer availability] GET error", {
        status: error?.response?.status,
        data: error?.response?.data,
        url: AVAILABILITY_ENDPOINT,
        method: "GET",
      });
      const detail = error?.response?.data?.detail || error?.response?.data?.message || "Unable to load availability right now.";
      setAvailabilityFeedback(detail);
    } finally {
      setLoadingAvailability(false);
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    try {
      setLoadingIncidents(true);
      const response = await api.get("/notifications/notifications/");
      const items = Array.isArray(response?.data) ? response.data : [];
      const broadcastItems = items.filter((item) => {
        const data = item?.data || {};
        return data?.type === "COMMUNITY_BROADCAST" || data?.broadcast === true || data?.recipient_role === "VOLUNTEER";
      });
      const normalizedIncidents = broadcastItems.map(normalizeIncident);
      const enrichedIncidents = await Promise.all(normalizedIncidents.map((incident) => enrichIncidentWithSosDetails(incident)));
      setIncidents(enrichedIncidents);
    } catch (error) {
      const detail = error?.response?.data?.detail || "Unable to load broadcast incidents right now.";
      setAvailabilityFeedback(detail);
      setIncidents([]);
    } finally {
      setLoadingIncidents(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const currentUser = await getStoredUser();
      if (mounted) {
        setUserRole(currentUser?.role || null);
      }
      await Promise.all([loadAvailability(), loadIncidents()]);
    };

    void init();

    return () => {
      mounted = false;
    };
  }, [loadAvailability, loadIncidents]);

  const handleToggleAvailability = async (nextValue) => {
    setSavingAvailability(true);
    setAvailabilityFeedback("");
    try {
      const authHeaders = await getAuthHeaders();
      console.log("[volunteer availability] PUT", {
        url: AVAILABILITY_ENDPOINT,
        method: "PUT",
        payload: { is_available: nextValue },
        authorization: authHeaders.Authorization ? "Bearer [present]" : "missing",
      });
      const response = await api.put(AVAILABILITY_ENDPOINT, { is_available: nextValue });
      const nextAvailability = response?.data || {};
      setAvailability((current) => ({ ...current, ...nextAvailability }));
      setAvailabilityFeedback(nextValue ? "You are now online." : "You are now offline.");
    } catch (error) {
      console.log("[volunteer availability] PUT error", {
        status: error?.response?.status,
        data: error?.response?.data,
        url: AVAILABILITY_ENDPOINT,
        method: "PUT",
        payload: { is_available: nextValue },
      });
      const backendError = error?.response?.data;
      const detail =
        (typeof backendError === "string" && backendError) ||
        backendError?.detail ||
        backendError?.message ||
        JSON.stringify(backendError || {}) ||
        "Unable to update your availability.";
      setAvailabilityFeedback(detail);
      Alert.alert("Unable to update", detail);
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleAcceptIncident = (incidentId) => {
    setAcceptedIds((current) => (current.includes(incidentId) ? current : [...current, incidentId]));
    setAvailabilityFeedback("Incident accepted.");
  };

  const handleViewDetails = (incident) => {
    if (incident.alertId) {
      router.push(`/alerts?alert_id=${incident.alertId}`);
      return;
    }
    router.push("/notifications");
  };

  const isVolunteer = useMemo(() => String(userRole || "").toUpperCase() === "VOLUNTEER", [userRole]);

  // Access guard: show access denied if user role is known and not VOLUNTEER
  if (userRole && !isVolunteer) {
    return (
      <AppScreen>
        <EmptyState
          title="Access denied"
          message="Volunteer incidents are available to volunteers only."
          icon="shield-outline"
          action={<AppButton title="Return to notifications" onPress={() => router.push("/notifications")} variant="secondary" />}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Volunteer" 
        title="Volunteer incidents"
        subtitle="Stay available, review community broadcast incidents, and respond quickly."
      />

      <SectionCard title="Availability" subtitle="Manage your volunteer presence" icon="shield-outline" style={styles.availabilityCard}>
        <View style={styles.availabilityRow}>
          <View style={styles.availabilityTextWrap}>
            <Text style={styles.availabilityTitle}>{availability.is_available ? "Online" : "Offline"}</Text>
            <Text style={styles.availabilitySubtitle}>Last updated: {formatUpdatedTime(availability.availability_updated_at)}</Text>
          </View>
          <Switch
            value={Boolean(availability.is_available)}
            onValueChange={handleToggleAvailability}
            disabled={savingAvailability || loadingAvailability}
            trackColor={{ false: appColors.border, true: appColors.blueSoft }}
            thumbColor={availability.is_available ? appColors.blue : appColors.white}
          />
        </View>
        {savingAvailability ? (
          <View style={styles.feedbackRow}>
            <ActivityIndicator size="small" color={appColors.blue} />
            <Text style={styles.feedbackText}>Saving your availability...</Text>
          </View>
        ) : null}
        {availabilityFeedback ? <Text style={styles.feedbackText}>{availabilityFeedback}</Text> : null}
      </SectionCard>

      <SectionCard title="Community incidents" subtitle="Broadcast incidents assigned to you" icon="warning-outline">
        {loadingIncidents ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={appColors.blue} />
            <Text style={styles.loadingText}>Loading incidents...</Text>
          </View>
        ) : null}

        {!loadingIncidents && incidents.length === 0 ? (
          <EmptyState
            title="No incidents yet"
            message={isVolunteer ? "Community broadcasts will appear here when you are selected for support." : "This screen is available for volunteer accounts."}
            icon="sparkles-outline"
          />
        ) : null}

        {!loadingIncidents && incidents.length > 0 ? (
          incidents.map((incident) => {
            const accepted = acceptedIds.includes(incident.id);
            return (
              <View key={incident.id} style={styles.incidentCard}>
                <View style={styles.incidentHeaderRow}>
                  <View style={styles.incidentTitleWrap}>
                    <Text style={styles.incidentResident}>{incident.residentName}</Text>
                    <Text style={styles.incidentMeta}>{incident.society} • {incident.blockFlat}</Text>
                  </View>
                  <StatusBadge label={accepted ? "Accepted" : incident.status || "Pending"} tone={accepted ? "success" : "warning"} compact />
                </View>
                <View style={styles.incidentDetailsRow}>
                  <View style={styles.incidentDetailBlock}>
                    <Text style={styles.incidentLabel}>SOS type</Text>
                    <Text style={styles.incidentValue}>{incident.sosType}</Text>
                  </View>
                  <View style={styles.incidentDetailBlock}>
                    <Text style={styles.incidentLabel}>Time</Text>
                    <Text style={styles.incidentValue}>{formatRelativeTime(incident.time)}</Text>
                  </View>
                </View>
                <View style={styles.incidentDetailsRow}>
                  <View style={styles.incidentDetailBlock}>
                    <Text style={styles.incidentLabel}>Distance</Text>
                    <Text style={styles.incidentValue}>{incident.distance || "Not available"}</Text>
                  </View>
                  <View style={styles.incidentDetailBlock}>
                    <Text style={styles.incidentLabel}>Status</Text>
                    <Text style={styles.incidentValue}>{incident.status || "Pending"}</Text>
                  </View>
                </View>
                <Text style={styles.incidentMessage}>{incident.message}</Text>
                <View style={styles.incidentActions}>
                  <AppButton title={accepted ? "Accepted" : "Accept incident"} onPress={() => handleAcceptIncident(incident.id)} loading={false} variant={accepted ? "secondary" : "primary"} style={styles.actionButton} />
                  <AppButton title="View details" onPress={() => handleViewDetails(incident)} variant="secondary" style={styles.actionButton} />
                </View>
              </View>
            );
          })
        ) : null}
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  availabilityCard: { marginBottom: 14 },
  availabilityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  availabilityTextWrap: { flex: 1 },
  availabilityTitle: { fontSize: 18, fontWeight: "700", color: appColors.navy },
  availabilitySubtitle: { color: appColors.muted, marginTop: 4 },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  feedbackText: { color: appColors.blue, marginTop: 8, fontSize: 13, fontWeight: "600" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  loadingText: { color: appColors.muted },
  incidentCard: {
    borderWidth: 1,
    borderColor: appColors.border,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    backgroundColor: appColors.mist,
  },
  incidentHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  incidentTitleWrap: { flex: 1 },
  incidentResident: { fontSize: 16, fontWeight: "700", color: appColors.navy },
  incidentMeta: { fontSize: 13, color: appColors.muted, marginTop: 4 },
  incidentDetailsRow: { flexDirection: "row", marginTop: 12, gap: 12 },
  incidentDetailBlock: { flex: 1 },
  incidentLabel: { fontSize: 12, fontWeight: "700", color: appColors.muted, textTransform: "uppercase" },
  incidentValue: { marginTop: 4, color: appColors.navy, fontSize: 14, fontWeight: "600" },
  incidentMessage: { marginTop: 12, color: appColors.slate, lineHeight: 20 },
  incidentActions: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  actionButton: { flex: 1, minWidth: 140 },
});
