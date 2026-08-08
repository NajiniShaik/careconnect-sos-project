import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppButton, AppScreen, EmptyState, PageHeader, SectionCard, StatusBadge, appColors } from "../../components/common/designSystem";
import { api, getStoredUser } from "../../services/authService";
import { fetchSosAlerts, normalizeSosHistory, getSosStatusLabel } from "../../services/sosService";

const AVAILABILITY_ENDPOINT = "/security/availability/";

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


export default function VolunteerIncidentsRoute() {
  const router = useRouter();
  const [availability, setAvailability] = useState({ is_available: false, availability_updated_at: null });
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilityFeedback, setAvailabilityFeedback] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  const loadAvailability = useCallback(async () => {
    try {
      setLoadingAvailability(true);
      const currentUser = await getStoredUser();
      const role = String(currentUser?.role || userRole || "").toUpperCase();
      const endpoint = role === "VOLUNTEER" ? "/volunteers/availability/" : "/security/availability/";
      const response = await api.get(endpoint);
      setAvailability(response?.data || { is_available: false, availability_updated_at: null });
      setAvailabilityFeedback("");
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.response?.data?.message || "Unable to load availability right now.";
      setAvailabilityFeedback(detail);
    } finally {
      setLoadingAvailability(false);
    }
  }, [userRole]);

  const loadIncidents = useCallback(async () => {
    try {
      setLoadingIncidents(true);
      const response = await fetchSosAlerts();
      const alerts = Array.isArray(response?.data) ? response.data : [];
      const normalizedIncidents = normalizeSosHistory(alerts);
      setIncidents(normalizedIncidents);
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
        setCurrentUserId(currentUser?.id || null);
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
      const currentUser = await getStoredUser();
      const role = String(currentUser?.role || userRole || "").toUpperCase();
      const endpoint = role === "VOLUNTEER" ? "/volunteers/availability/" : "/security/availability/";
      const method = role === "VOLUNTEER" ? "put" : "patch";
      const response = await api[method](endpoint, { is_available: nextValue });
      const nextAvailability = response?.data || {};
      setAvailability((current) => ({ ...current, ...nextAvailability }));
      setAvailabilityFeedback(nextValue ? "You are now online." : "You are now offline.");
    } catch (error) {
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

  const handleAcceptIncident = async (incident) => {
    const targetId = incident?.alertId || incident?.id;
    if (!targetId) {
      setAvailabilityFeedback("This incident cannot be accepted right now.");
      return;
    }

    if (incident?.accepted) {
      setAvailabilityFeedback("This incident is already accepted.");
      return;
    }

    try {
      await api.patch(`/sos/${targetId}/`, { action: "accept" });
      await loadIncidents();
      setAvailabilityFeedback("Incident accepted.");
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.response?.data?.message || "Unable to accept this incident right now.";
      setAvailabilityFeedback(detail);
      Alert.alert("Unable to accept", detail);
    }
  };

  const handleViewDetails = (incident) => {
    console.log("[volunteer-incidents] View details", {
      role: normalizedRole,
      alertId: incident?.alertId,
      id: incident?.id,
      assignedVolunteerId: incident?.assigned_volunteer_id || incident?.assigned_volunteer,
      status: incident?.status,
      current_status: incident?.current_status,
    });

    if (incident.alertId) {
      router.push({ pathname: "/incident-updates", params: { incident_id: incident.alertId } });
      return;
    }
    router.push("/notifications");
  };

  const normalizedRole = String(userRole || "").toUpperCase();
  const isVolunteer = normalizedRole === "VOLUNTEER";
  const isSecurity = normalizedRole === "SECURITY";
  const isAdmin = normalizedRole === "ADMIN";
  const isAllowedRole = isVolunteer || isSecurity || isAdmin;

  // Access guard: allow volunteers, security, and admins to monitor community incidents
  if (userRole && !isAllowedRole) {
    return (
      <AppScreen>
        <EmptyState
          title="Access denied"
          message="Volunteer incidents are available to volunteers, security, and admins only."
          icon="shield-outline"
          action={<AppButton title="Return to notifications" onPress={() => router.push("/notifications")} variant="secondary" />}
        />
      </AppScreen>
    );
  }

  const pageTitle = isSecurity ? "Security Incidents" : isAdmin ? "Community Incidents" : "Volunteer Incidents";
  const pageSubtitle = isSecurity
    ? "Monitor community broadcast incidents and coordinate security response."
    : "Stay available, review community broadcast incidents, and respond quickly.";

  return (
    <AppScreen>
      <PageHeader
        eyebrow={isSecurity ? "Security" : "Volunteer"}
        title={pageTitle}
        subtitle={pageSubtitle}
      />

      <SectionCard title="Availability" subtitle={isSecurity ? "Manage your security availability and response status" : "Manage your volunteer presence"} icon="shield-outline" style={styles.availabilityCard}>
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

      <SectionCard title="Community incidents" subtitle={isSecurity ? "Broadcast incidents relevant to your security response" : "Broadcast incidents assigned to you"} icon="warning-outline">
        {loadingIncidents ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={appColors.blue} />
            <Text style={styles.loadingText}>Loading incidents...</Text>
          </View>
        ) : null}

        {!loadingIncidents && incidents.length === 0 ? (
          <EmptyState
            title="No incidents yet"
            message={isVolunteer || isSecurity ? "Community broadcasts will appear here when you are selected for support." : "This screen is available for volunteer and security accounts."}
            icon="sparkles-outline"
          />
        ) : null}

        {!loadingIncidents && incidents.length > 0 ? (
          incidents.map((incident) => {
              // Determine assigned state from backend-provided field
              const assignedId = incident.assigned_volunteer_id || incident.assigned_volunteer || null;
              const assignedName = incident.assigned_volunteer_name || '';
              const isAssigned = assignedId !== null && assignedId !== undefined && assignedId !== '';
              const isAssignedToMe = isAssigned && currentUserId && Number(currentUserId) === Number(assignedId);

              const statusLabel = getSosStatusLabel(incident.status) || (isAssigned ? 'Accepted' : (incident.status || 'Pending'));

              // Build meta without stray bullets
              const metaParts = [];
              if (incident.society) metaParts.push(incident.society);
              if (incident.blockFlat) metaParts.push(incident.blockFlat);

              return (
                <View key={incident.id} style={styles.incidentCard}>
                  <View style={styles.incidentHeaderRow}>
                    <View style={styles.incidentTitleWrap}>
                      <Text style={styles.incidentResident}>{incident.residentName || incident.user || ''}</Text>
                      {metaParts.length > 0 ? <Text style={styles.incidentMeta}>{metaParts.join(' • ')}</Text> : null}
                    </View>
                    <StatusBadge label={statusLabel} tone={isAssigned ? 'success' : 'warning'} compact />
                  </View>

                  <View style={styles.incidentDetailsRow}>
                    <View style={styles.incidentDetailBlock}>
                      <Text style={styles.incidentLabel}>SOS type</Text>
                      <Text style={styles.incidentValue}>{incident.sosType || ''}</Text>
                    </View>
                    <View style={styles.incidentDetailBlock}>
                      <Text style={styles.incidentLabel}>Time</Text>
                      <Text style={styles.incidentValue}>{formatRelativeTime(incident.time)}</Text>
                    </View>
                  </View>

                  <View style={styles.incidentDetailsRow}>
                    <View style={styles.incidentDetailBlock}>
                      <Text style={styles.incidentLabel}>Location</Text>
                      <Text style={styles.incidentValue}>{incident.address || incident.location || ''}</Text>
                    </View>
                    <View style={styles.incidentDetailBlock}>
                      <Text style={styles.incidentLabel}>Distance</Text>
                      <Text style={styles.incidentValue}>{incident.distance != null ? String(incident.distance) : ''}</Text>
                    </View>
                  </View>

                  {incident.message ? <Text style={styles.incidentMessage}>{incident.message}</Text> : null}

                  <View style={styles.incidentActions}>
                    {isAssigned ? (
                      isAssignedToMe ? (
                        <AppButton title={`Assigned to you`} onPress={() => handleViewDetails(incident)} variant="primary" style={styles.actionButton} />
                      ) : (
                        <AppButton title={`Assigned`} onPress={() => {}} disabled variant="secondary" style={styles.actionButton} />
                      )
                    ) : (
                      <AppButton title={`Accept incident`} onPress={() => handleAcceptIncident(incident)} loading={false} variant="primary" style={styles.actionButton} />
                    )}

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
  incidentActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },
  actionButton: {
    minWidth: 116,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "center",
    flexShrink: 1,
  },
});
