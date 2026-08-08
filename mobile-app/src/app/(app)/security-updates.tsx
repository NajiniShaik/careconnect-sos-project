// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AppButton,
  AppScreen,
  AppTextInput,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  appColors,
} from "../../components/common/designSystem";
import { clearAuth, getErrorMessage, getStoredUser } from "../../services/authService";
import {
  fetchSecurityIncidentCoordination,
  fetchSosUpdates,
  postSosUpdate,
} from "../../services/sosService";

const STATUS_OPTIONS = ["ACKNOWLEDGED", "IN_PROGRESS", "ACTIVE", "ESCALATED", "RESOLVED", "CLOSED"];

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

function UpdateCard({ update }) {
  return (
    <View style={styles.updateItem}>
      <View style={styles.updateHeader}>
        <Text style={styles.updateRole}>{String(update?.role || "SECURITY").toUpperCase()}</Text>
        <Text style={styles.updateDate}>{formatDate(update?.created_at)}</Text>
      </View>
      <Text style={styles.updateType}>{update?.update_type || "Response update"}</Text>
      <Text style={styles.updateMessage}>{update?.message || "No details provided."}</Text>
    </View>
  );
}

export default function SecurityUpdatesRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const incidentId = String(getParamValue(params, "incidentId") || getParamValue(params, "incident_id") || getParamValue(params, "id")).trim();
  const returnTarget = getReturnTarget(params);
  const handleReturn = useCallback(() => {
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
  const [coordination, setCoordination] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState("");
  const [updateType, setUpdateType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ACKNOWLEDGED");

  const loadData = useCallback(async (isRefresh = false) => {
    if (!incidentId) {
      setError("Select an incident from the Security Dashboard first.");
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [coordinationResponse, updatesResponse] = await Promise.all([
        fetchSecurityIncidentCoordination(incidentId),
        fetchSosUpdates(incidentId),
      ]);
      setCoordination(coordinationResponse?.data || null);
      setUpdates(Array.isArray(updatesResponse?.data) ? updatesResponse.data : []);
    } catch (loadError) {
      if (loadError?.response?.status === 401 || loadError?.response?.status === 403) {
        await clearAuth();
        router.replace("/");
        return;
      }
      setError(getErrorMessage(loadError) || "Unable to load incident response updates.");
    } finally {
      setLoading(false);
      setRefreshing(false);
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
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [authLoading, loadData, userRole]);

  const sortedUpdates = useMemo(
    () => [...updates].sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime()),
    [updates]
  );

  const handleSubmit = useCallback(async () => {
    const trimmedMessage = String(message || "").trim();
    if (!trimmedMessage) {
      setError("Enter a response update before submitting.");
      return;
    }
    if (!incidentId || posting) return;

    setPosting(true);
    setError("");
    setFeedback("");
    try {
      const response = await postSosUpdate(incidentId, {
        message: trimmedMessage,
        status: selectedStatus,
        update_type: String(updateType || "").trim() || "Response",
      });
      if (!response?.data) throw new Error("The response update was not saved.");
      setMessage("");
      setUpdateType("");
      setFeedback("Response update submitted successfully.");
      await loadData(true);
    } catch (submitError) {
      if (submitError?.response?.status === 401 || submitError?.response?.status === 403) {
        await clearAuth();
        router.replace("/");
        return;
      }
      setError(getErrorMessage(submitError) || "Unable to submit the response update.");
    } finally {
      setPosting(false);
    }
  }, [incidentId, loadData, message, posting, router, selectedStatus, updateType]);

  if (authLoading) {
    return <AppScreen><View style={styles.centered}><ActivityIndicator size="large" color={appColors.blue} /></View></AppScreen>;
  }

  if (userRole !== "SECURITY") {
    return (
      <AppScreen>
        <EmptyState
          title="Access denied"
          message="Incident response updates are available to security staff only."
          icon="shield-outline"
          action={<AppButton title="Return to dashboard" onPress={handleReturn} variant="secondary" />}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable={false}>
      <PageHeader
        eyebrow="Security operations"
        title="Response updates"
        subtitle={incidentId ? `Incident #${incidentId}` : "Incident not selected"}
        action={<AppButton title="Back" onPress={handleReturn} variant="secondary" />}
      />

      {loading ? (
        <View style={styles.loadingState}><ActivityIndicator size="large" color={appColors.blue} /><Text style={styles.loadingText}>Loading response history...</Text></View>
      ) : !coordination ? (
        <EmptyState
          title="Response history unavailable"
          message={error || "No incident data was returned."}
          icon="time-outline"
          action={<AppButton title="Retry" onPress={() => void loadData()} />}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} tintColor={appColors.blue} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SectionCard title="Current incident status" icon="shield-outline">
            <View style={styles.statusRow}>
              <Text style={styles.incidentTitle}>{coordination.message || "SOS incident"}</Text>
              <StatusBadge label={coordination.current_status || coordination.status || "UNKNOWN"} tone={statusTone(coordination.current_status || coordination.status)} compact />
            </View>
            <Text style={styles.mutedText}>Society: {coordination.society?.name || "Not available"}</Text>
          </SectionCard>

          <SectionCard title="Response history" subtitle={`${updates.length} update${updates.length === 1 ? "" : "s"}`} icon="time-outline">
            {sortedUpdates.length ? sortedUpdates.map((update, index) => <UpdateCard key={`${update?.id || "update"}-${index}`} update={update} />) : <Text style={styles.mutedText}>No response updates have been posted yet.</Text>}
          </SectionCard>

          <SectionCard title="Submit response update" subtitle="Record the current action or resolution." icon="clipboard-outline">
            <Text style={styles.inputLabel}>Status</Text>
            <View style={styles.statusOptions}>
              {STATUS_OPTIONS.map((status) => (
                <Pressable key={status} onPress={() => setSelectedStatus(status)} style={[styles.statusOption, selectedStatus === status && styles.statusOptionSelected]}>
                  <Text style={[styles.statusOptionText, selectedStatus === status && styles.statusOptionTextSelected]}>{status.replace("_", " ")}</Text>
                </Pressable>
              ))}
            </View>
            <AppTextInput label="Update type" placeholder="Response, escalation, resolution" value={updateType} onChangeText={setUpdateType} />
            <AppTextInput label="Message" placeholder="Describe the response or resolution" value={message} onChangeText={setMessage} multiline numberOfLines={4} style={styles.messageInput} />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {feedback ? <Text style={styles.successText}>{feedback}</Text> : null}
            <AppButton title={posting ? "Submitting..." : "Submit update"} onPress={() => void handleSubmit()} loading={posting} disabled={posting} />
          </SectionCard>
        </ScrollView>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { color: appColors.slate, marginTop: 12 },
  content: { paddingBottom: 32 },
  statusRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  incidentTitle: { flex: 1, color: appColors.navy, fontSize: 17, fontWeight: "800", lineHeight: 23 },
  mutedText: { color: appColors.muted, lineHeight: 21 },
  updateItem: { borderTopWidth: 1, borderTopColor: appColors.border, paddingVertical: 12 },
  updateHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  updateRole: { color: appColors.blue, fontSize: 12, fontWeight: "800" },
  updateDate: { color: appColors.muted, fontSize: 12 },
  updateType: { color: appColors.navy, fontSize: 14, fontWeight: "700", marginTop: 6 },
  updateMessage: { color: appColors.slate, fontSize: 14, lineHeight: 21, marginTop: 4 },
  inputLabel: { color: appColors.navy, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  statusOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  statusOption: { borderWidth: 1, borderColor: appColors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: appColors.mist },
  statusOptionSelected: { borderColor: appColors.blue, backgroundColor: appColors.blueSoft },
  statusOptionText: { color: appColors.slate, fontSize: 12, fontWeight: "700" },
  statusOptionTextSelected: { color: appColors.blue },
  messageInput: { minHeight: 96, textAlignVertical: "top" },
  errorText: { color: appColors.red, lineHeight: 20, marginBottom: 10 },
  successText: { color: appColors.green, lineHeight: 20, marginBottom: 10 },
});
