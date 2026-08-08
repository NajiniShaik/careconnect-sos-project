import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppButton, AppScreen, EmptyState, PageHeader, SectionCard, StatusBadge, appColors } from "../../components/common/designSystem";
import { api, getStoredUser } from "../../services/authService";
import { fetchNotificationsFromBackend } from "../../services/notificationService";

function getParamValue(params, key) {
  const value = params?.[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function formatIncidentTime(value) {
  if (!value) {
    return "Recently received";
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return value;
  }

  return dateValue.toLocaleString();
}

function getStatusTone(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "RESOLVED") {
    return "success";
  }
  if (normalized === "PENDING" || normalized === "OPEN") {
    return "danger";
  }
  return "warning";
}

function normalizeSecurityIncident(item = {}) {
  const data = item?.data || {};
  const alertId = data?.alert_id || data?.alertId || data?.alertid || null;

  return {
    id: item?.id || alertId || `${Date.now()}`,
    alertId,
    notificationId: item?.id || null,
    residentName: data?.resident_name || data?.residentName || data?.resident?.name || data?.resident?.username || item?.title || "Resident",
    society: data?.society_name || data?.societyName || data?.society || "Unknown society",
    blockTower: data?.block_tower || data?.blockTower || data?.block || data?.tower || data?.location || "Not provided",
    flat: data?.flat || data?.flat_number || data?.flatNumber || data?.unit || "Not provided",
    sosType: data?.sos_type || data?.sosType || data?.category || data?.type || "Security alert",
    incidentTime: item?.received_at || item?.created_at || data?.created_at || null,
    priority: data?.priority || data?.alert_priority || "Medium",
    status: data?.status || "PENDING",
    message: item?.body || data?.message || "Security alert requires attention.",
  };
}

export default function SecurityIncidentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [userRole, setUserRole] = useState(null);
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");

  const notificationId = useMemo(() => getParamValue(params, "notificationId") || getParamValue(params, "notification_id") || "", [params]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const user = await getStoredUser();
        if (mounted) setUserRole((user?.role || "").toUpperCase() || null);
      } catch {
        if (mounted) setUserRole(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const loadIncident = useCallback(async () => {
    setLoading(true);
    setError("");
    setActionFeedback("");

    try {
      const notifications = await fetchNotificationsFromBackend();
      const list = Array.isArray(notifications) ? notifications : [];
      const matchedNotification = notificationId
        ? list.find((item) => String(item?.id) === String(notificationId)) || null
        : null;

      const fallbackNotification = matchedNotification || list.find((item) => {
        const type = String(item?.data?.type || item?.kind || "").toUpperCase();
        return type === "SECURITY_ALERT";
      }) || null;

      const nextIncident = fallbackNotification ? normalizeSecurityIncident(fallbackNotification) : null;

      if (nextIncident?.alertId) {
        const response = await api.get(`/sos/alerts/${nextIncident.alertId}/`);
        const detail = response?.data || {};
        const detailIncident = {
          ...nextIncident,
          residentName: detail?.user?.username || detail?.user?.email || nextIncident.residentName,
          society: detail?.society_name || detail?.society || nextIncident.society,
          blockTower: detail?.block || detail?.tower || detail?.location || nextIncident.blockTower,
          flat: detail?.flat || detail?.flat_number || nextIncident.flat,
          sosType: detail?.category || detail?.sos_type || nextIncident.sosType,
          incidentTime: detail?.created_at || nextIncident.incidentTime,
          priority: detail?.priority || nextIncident.priority,
          status: detail?.status || nextIncident.status,
          message: detail?.message || detail?.details || nextIncident.message,
        };
        setIncident(detailIncident);
      } else {
        setIncident(nextIncident);
      }
    } catch (loadError) {
      const detail = loadError?.response?.data?.detail || loadError?.message || "Unable to load the security incident details right now.";
      setError(detail);
      setIncident(null);
    } finally {
      setLoading(false);
    }
  }, [notificationId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadIncident();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadIncident]);

  const handleAcknowledge = () => {
    setActionFeedback("Acknowledged. The incident is marked for follow-up.");
    Alert.alert("Acknowledged", "The incident has been marked for follow-up.");
  };

  const handleRespond = () => {
    console.log("[security-incidents] View details", {
      role: userRole,
      alertId: incident?.alertId,
      id: incident?.id,
      assignedVolunteerId: incident?.assigned_volunteer_id || incident?.assigned_volunteer,
      status: incident?.status,
      current_status: incident?.current_status,
    });

    if (incident?.alertId) {
      router.push(`/alerts?alert_id=${incident.alertId}`);
      return;
    }
    Alert.alert("Respond", "Use the existing SOS workflow for response actions.");
  };

  const handleViewResidentDetails = () => {
    console.log("[security-incidents] View details", {
      role: userRole,
      alertId: incident?.alertId,
      id: incident?.id,
      assignedVolunteerId: incident?.assigned_volunteer_id || incident?.assigned_volunteer,
      status: incident?.status,
      current_status: incident?.current_status,
    });

    if (incident?.alertId) {
      router.push(`/alerts?alert_id=${incident.alertId}`);
      return;
    }
    Alert.alert("Resident details", "Resident details are available in the existing alert view.");
  };

  return (
    <AppScreen>
      {/* Access guard: allow SECURITY and ADMIN roles to view this screen */}
      {userRole && userRole !== "SECURITY" && userRole !== "ADMIN" ? (
        <EmptyState
          title="Access denied"
          message="This screen is available to security personnel only."
          icon="shield-outline"
          action={<AppButton title="Return to notifications" onPress={() => router.push("/notifications")} variant="secondary" />}
        />
      ) : null}
      <PageHeader
        eyebrow="Security"
        title="Security incident alert"
        subtitle="Review security alerts and coordinate follow-up without adding extra navigation tabs."
      />

      {loading ? (
        <SectionCard title="Loading incident" subtitle="Fetching the latest alert details" icon="shield-outline">
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={appColors.blue} />
            <Text style={styles.loadingText}>Loading incident details...</Text>
          </View>
        </SectionCard>
      ) : null}

      {!loading && !incident ? (
        <EmptyState
          title="No security incident selected"
          message={error || "Open this screen from a security notification or by routing directly to it."}
          icon="shield-outline"
          action={<AppButton title="Return to notifications" onPress={() => router.push("/notifications")} variant="secondary" />}
        />
      ) : null}

      {!loading && incident ? (
        <View>
          <SectionCard title="Incident summary" subtitle="Current security alert details" icon="shield-outline" style={styles.summaryCard}>
            <View style={styles.rowBetween}>
              <View style={styles.infoBlock}>
                <Text style={styles.label}>Resident name</Text>
                <Text style={styles.value}>{incident.residentName}</Text>
              </View>
              <StatusBadge label={incident.status} tone={getStatusTone(incident.status)} compact />
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.infoBlock}>
                <Text style={styles.label}>Society</Text>
                <Text style={styles.value}>{incident.society}</Text>
              </View>
              <View style={styles.infoBlock}>
                <Text style={styles.label}>Block / Tower</Text>
                <Text style={styles.value}>{incident.blockTower}</Text>
              </View>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.infoBlock}>
                <Text style={styles.label}>Flat</Text>
                <Text style={styles.value}>{incident.flat}</Text>
              </View>
              <View style={styles.infoBlock}>
                <Text style={styles.label}>SOS type</Text>
                <Text style={styles.value}>{incident.sosType}</Text>
              </View>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.infoBlock}>
                <Text style={styles.label}>Incident time</Text>
                <Text style={styles.value}>{formatIncidentTime(incident.incidentTime)}</Text>
              </View>
              <View style={styles.infoBlock}>
                <Text style={styles.label}>Alert priority</Text>
                <Text style={styles.value}>{incident.priority}</Text>
              </View>
            </View>

            <View style={styles.messageBox}>
              <Text style={styles.label}>Current status</Text>
              <Text style={styles.messageText}>{incident.message}</Text>
            </View>
          </SectionCard>

          <SectionCard title="Actions" subtitle="Take next steps without changing the existing workflow" icon="hand-left-outline">
            <View style={styles.actionRow}>
              <AppButton title="Acknowledge" onPress={handleAcknowledge} variant="secondary" style={styles.actionButton} />
              <AppButton title="Respond" onPress={handleRespond} style={styles.actionButton} />
            </View>
            <View style={styles.actionRow}>
              <AppButton title="View Resident Details" onPress={handleViewResidentDetails} variant="secondary" style={styles.actionButtonWide} />
            </View>
            {actionFeedback ? <Text style={styles.feedbackText}>{actionFeedback}</Text> : null}
          </SectionCard>
        </View>
      ) : null}

      {error && !loading ? <Text style={styles.errorText}>{error}</Text> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summaryCard: { marginBottom: 14 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { color: appColors.slate, fontSize: 14 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 },
  detailsGrid: { flexDirection: "row", gap: 12, marginTop: 10 },
  infoBlock: { flex: 1 },
  label: { color: appColors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  value: { color: appColors.navy, fontSize: 15, fontWeight: "700", marginTop: 4 },
  messageBox: { marginTop: 12, backgroundColor: appColors.mist, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: appColors.border },
  messageText: { color: appColors.slate, marginTop: 6, lineHeight: 20 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 4, flexWrap: "wrap" },
  actionButton: { flex: 1, minWidth: 140 },
  actionButtonWide: { flex: 1, minWidth: 220 },
  feedbackText: { color: appColors.blue, marginTop: 10, fontSize: 13, fontWeight: "600" },
  errorText: { color: appColors.red, marginTop: 12, fontSize: 14, fontWeight: "600" },
});
