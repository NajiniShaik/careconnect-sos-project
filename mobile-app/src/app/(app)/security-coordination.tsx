// @ts-nocheck
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AppButton,
  AppScreen,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  appColors,
} from "../../components/common/designSystem";
import { clearAuth, getErrorMessage, getStoredUser } from "../../services/authService";
import { fetchSecurityIncidentCoordination } from "../../services/sosService";

function getParamValue(params, key) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getReturnTarget(params) {
  const explicit = params && (params.returnTo || params.return_to || params.returnto || params.return);
  try {
    if (explicit) return decodeURIComponent(String(Array.isArray(explicit) ? explicit[0] : explicit));
  } catch (e) {
    // fall through
  }
  return "/security-dashboard";
}

function statusTone(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "RESOLVED" || normalized === "CLOSED") return "success";
  if (normalized === "ESCALATED" || normalized === "OPEN") return "warning";
  return "neutral";
}

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "Not available"}</Text>
    </View>
  );
}

export default function SecurityCoordinationRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const incidentId = String(getParamValue(params, "incidentId") || getParamValue(params, "incident_id") || getParamValue(params, "id")).trim();
  const returnTarget = getReturnTarget(params);
  const handleReturn = useCallback(() => {
    // If a return target was explicitly provided, always navigate there deterministically.
    if (returnTarget) {
      router.replace(returnTarget);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/security-dashboard");
  }, [router, returnTarget]);
  const [userRole, setUserRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadIncident = useCallback(async () => {
    if (!incidentId) {
      setIncident(null);
      setError("Select an incident from the Security Dashboard first.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetchSecurityIncidentCoordination(incidentId);
      setIncident(response?.data || null);
    } catch (loadError) {
      if (loadError?.response?.status === 401 || loadError?.response?.status === 403) {
        await clearAuth();
        router.replace("/");
        return;
      }
      setIncident(null);
      setError(getErrorMessage(loadError) || "Unable to load coordination details.");
    } finally {
      setLoading(false);
    }
  }, [incidentId, router]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const user = await getStoredUser();
        if (mounted) setUserRole(String(user?.role || "").toUpperCase() || null);
      } catch {
        if (mounted) setUserRole(null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading || userRole !== "SECURITY") return undefined;
    const timer = setTimeout(() => {
      void loadIncident();
    }, 0);
    return () => clearTimeout(timer);
  }, [authLoading, loadIncident, userRole]);

  if (authLoading) {
    return (
      <AppScreen>
        <View style={styles.centered}><ActivityIndicator size="large" color={appColors.blue} /></View>
      </AppScreen>
    );
  }

  if (userRole !== "SECURITY") {
    return (
      <AppScreen>
        <EmptyState
          title="Access denied"
          message="Response coordination is available to security staff only."
          icon="shield-outline"
          action={<AppButton title="Return to dashboard" onPress={handleReturn} variant="secondary" />}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Security operations"
        title="Response coordination"
        subtitle={incidentId ? `Incident #${incidentId}` : "Incident not selected"}
        action={<AppButton title="Back" onPress={handleReturn} variant="secondary" />}
      />

      {loading ? (
        <SectionCard title="Loading coordination" icon="shield-outline">
          <View style={styles.loadingRow}><ActivityIndicator color={appColors.blue} /><Text style={styles.loadingText}>Fetching incident details...</Text></View>
        </SectionCard>
      ) : null}

      {!loading && !incident ? (
        <EmptyState
          title="Coordination details unavailable"
          message={error || "No incident coordination data was returned."}
          icon="shield-outline"
          action={<AppButton title="Retry" onPress={() => void loadIncident()} />}
        />
      ) : null}

      {!loading && incident ? (
        <>
          <SectionCard title="Incident details" icon="warning-outline">
            <View style={styles.statusRow}>
              <Text style={styles.incidentTitle}>{incident.message || "SOS incident"}</Text>
              <StatusBadge label={incident.current_status || incident.status || "UNKNOWN"} tone={statusTone(incident.current_status || incident.status)} compact />
            </View>
            <DetailRow label="Category" value={incident.category} />
            <DetailRow label="Priority" value={incident.priority} />
            <DetailRow label="Location" value={incident.location} />
            <DetailRow label="Created" value={formatDate(incident.created_at)} />
          </SectionCard>

          <SectionCard title="Society and assignment" icon="people-outline">
            <DetailRow label="Society" value={incident.society?.name} />
            <DetailRow label="Resident" value={incident.incident_owner} />
            <DetailRow label="Assigned responder" value={incident.assigned_volunteer} />
            <DetailRow label="Last changed" value={formatDate(incident.updated_at)} />
          </SectionCard>

          <SectionCard title="Latest response" icon="time-outline">
            {incident.coordination?.latest_update ? (
              <>
                <Text style={styles.updateMessage}>{incident.coordination.latest_update.message || "No message provided."}</Text>
                <DetailRow label="Update type" value={incident.coordination.latest_update.update_type} />
                <DetailRow label="Role" value={incident.coordination.latest_update.role} />
                <DetailRow label="Created" value={formatDate(incident.coordination.latest_update.created_at)} />
              </>
            ) : (
              <Text style={styles.mutedText}>No response update has been posted yet.</Text>
            )}
          </SectionCard>

          <View style={styles.actions}>
            <AppButton title="Open response updates" onPress={() => router.push(`/security-updates?incidentId=${encodeURIComponent(incidentId)}&returnTo=${encodeURIComponent(returnTarget)}`)} />
            <AppButton title="Refresh" onPress={() => void loadIncident()} variant="secondary" />
          </View>
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { color: appColors.slate, fontSize: 14 },
  statusRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  incidentTitle: { flex: 1, color: appColors.navy, fontSize: 18, fontWeight: "800", lineHeight: 24 },
  detailRow: { marginBottom: 12 },
  detailLabel: { color: appColors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 3 },
  detailValue: { color: appColors.navy, fontSize: 15, lineHeight: 21 },
  updateMessage: { color: appColors.navy, fontSize: 16, lineHeight: 24, marginBottom: 14 },
  mutedText: { color: appColors.muted, lineHeight: 21 },
  actions: { gap: 10, marginBottom: 20 },
});
