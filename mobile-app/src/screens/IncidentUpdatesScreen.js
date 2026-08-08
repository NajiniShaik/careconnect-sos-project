import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppButton, AppScreen, AppTextInput, EmptyState, PageHeader, SectionCard, appColors } from "../components/common/designSystem";
import { getErrorMessage, getStoredUser } from "../services/authService";
import { emitSosUpdate, fetchSosUpdates, postSosUpdate, subscribeToSosUpdates, mergeSosMessages } from "../services/sosService";

const AUTH_POST_ROLES = new Set(["ADMIN", "SECURITY", "VOLUNTEER"]);

function UpdateCard({ update }) {
  return (
    <SectionCard style={styles.updateCard}>
      <View style={styles.updateHeader}>
        <Text style={styles.updateUser}>{update.user?.username || update.user?.name || "Unknown user"}</Text>
        <Text style={styles.updateRole}>{String(update.role || "Role unavailable").toUpperCase()}</Text>
      </View>
      <View style={styles.updateFieldRow}>
        <Text style={styles.updateFieldLabel}>Update type</Text>
        <Text style={styles.updateFieldValue}>{update.update_type || "General"}</Text>
      </View>
      <View style={styles.updateFieldRow}>
        <Text style={styles.updateFieldLabel}>Message</Text>
        <Text style={styles.updateFieldValue}>{update.message || "No details provided."}</Text>
      </View>
      <View style={styles.updateFieldRow}>
        <Text style={styles.updateFieldLabel}>Created</Text>
        <Text style={styles.updateTimestamp}>{new Date(update.created_at || update.createdAt || "").toLocaleString()}</Text>
      </View>
    </SectionCard>
  );
}

export default function IncidentUpdatesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const incidentId = String(params?.incident_id || params?.incidentId || params?.id || "").trim();
  const [user, setUser] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [updateType, setUpdateType] = useState("");
  const [posting, setPosting] = useState(false);

  const canPost = useMemo(() => {
    const role = String(user?.role || "").toUpperCase();
    return AUTH_POST_ROLES.has(role);
  }, [user]);

  const loadUpdates = useCallback(async () => {
    if (!incidentId) {
      setError("Incident id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetchSosUpdates(incidentId);
      const results = Array.isArray(response?.data) ? response.data : [];
      setUpdates(results);
    } catch (err) {
      if (err?.response?.status === 403) {
        setError('Permission denied: you are not allowed to view incident updates.');
      } else {
        setError(getErrorMessage(err) || "Unable to load incident updates right now.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [incidentId]);

  useEffect(() => {
    const initializeUser = async () => {
      const storedUser = await getStoredUser();
      setUser(storedUser);
    };

    void initializeUser();
  }, []);

  useEffect(() => {
    const initializeUpdates = async () => {
      await loadUpdates();
    };

    void initializeUpdates();
  }, [loadUpdates]);

  useEffect(() => {
    if (!incidentId) {
      return;
    }

    const unsubscribe = subscribeToSosUpdates((sosId, update) => {
      if (String(sosId) !== incidentId) {
        return;
      }
      setUpdates((prev) => mergeSosMessages(prev, update));
    });

    return () => {
      try {
        unsubscribe();
      } catch (e) {
        // ignore unsubscribe errors
      }
    };
  }, [incidentId]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadUpdates();
  }, [loadUpdates]);

  const handlePostUpdate = useCallback(async () => {
    const trimmedMessage = String(message || "").trim();
    if (!trimmedMessage) {
      setError("Enter an update message before posting.");
      return;
    }

    if (!incidentId) {
      setError("Incident id is missing.");
      return;
    }

    setPosting(true);
    setError("");

    try {
      const storedUser = user ?? (await getStoredUser());
      const payload = {
        message: trimmedMessage,
        role: String(storedUser?.role || "").trim().toUpperCase(),
      };

      if (String(updateType || "").trim()) {
        payload.update_type = String(updateType).trim();
      }

      const response = await postSosUpdate(incidentId, payload);
      const createdUpdate = response?.data || null;
      if (createdUpdate) {
        setUpdates((prev) => [...prev, createdUpdate]);
        try {
          emitSosUpdate(incidentId, createdUpdate);
        } catch (e) {
          // ignore pubsub errors
        }
      }
      setMessage("");
      setUpdateType("");
    } catch (err) {
      setError(getErrorMessage(err) || "Unable to post the update right now.");
    } finally {
      setPosting(false);
    }
  }, [incidentId, message, updateType, user]);

  const sortedUpdates = useMemo(() => {
    return [...updates].sort((left, right) => {
      const leftTime = new Date(left?.created_at || left?.createdAt || 0).getTime();
      const rightTime = new Date(right?.created_at || right?.createdAt || 0).getTime();
      return leftTime - rightTime;
    });
  }, [updates]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.push("/(app)/alerts");
  }, [router]);

  const listEmptyComponent = useMemo(() => {
    if (loading || refreshing) {
      return null;
    }

    if (error) {
      return (
        <EmptyState
          title="Unable to load updates"
          message={error}
          action={<AppButton title="Retry" onPress={() => void loadUpdates()} />}
        />
      );
    }

    return (
      <EmptyState
        title="No incident updates"
        message="No updates have been posted for this incident yet."
        action={<AppButton title="Refresh" onPress={handleRefresh} />}
      />
    );
  }, [error, handleRefresh, loadUpdates, loading, refreshing]);

  return (
    <AppScreen scrollable={false}>
      <PageHeader
        eyebrow="Incident updates"
        title="Incident Updates"
        subtitle={incidentId ? `Incident #${incidentId}` : "Incident details unavailable"}
        action={<AppButton title="Back" variant="secondary" onPress={handleBack} />}
      />

      {loading && !refreshing ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={appColors.blue} />
          <Text style={styles.loadingText}>Loading updates…</Text>
        </View>
      ) : (
        <FlatList
          data={sortedUpdates}
          keyExtractor={(item, index) => String(item?.id ?? `${item?.created_at || item?.createdAt || index}`) + `-${index}`}
          renderItem={({ item }) => <UpdateCard update={item} />}
          contentContainerStyle={[styles.listContainer, sortedUpdates.length === 0 && styles.emptyListContainer]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={appColors.blue} />}
          ListEmptyComponent={listEmptyComponent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {canPost ? (
        <SectionCard title="Post an update" subtitle="Share the latest incident response details.">
          <AppTextInput
            label="Update type"
            placeholder="e.g. Response, Escalation, Resolved"
            value={updateType}
            onChangeText={setUpdateType}
          />
          <AppTextInput
            label="Message"
            placeholder="Write your update here"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
            style={styles.messageInput}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <AppButton title={posting ? "Posting..." : "Post Update"} onPress={handlePostUpdate} loading={posting} />
        </SectionCard>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  listContainer: { paddingHorizontal: 20, paddingBottom: 32 },
  emptyListContainer: { flex: 1, justifyContent: "center" },
  loadingState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  updateCard: { marginBottom: 14 },
  updateHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  updateUser: { fontSize: 15, fontWeight: "800", color: appColors.navy, flex: 1, marginRight: 8 },
  updateRole: { fontSize: 12, fontWeight: "700", color: appColors.blue, textTransform: "uppercase" },
  updateFieldRow: { marginBottom: 10 },
  updateFieldLabel: { fontSize: 12, fontWeight: "700", color: appColors.muted, marginBottom: 4 },
  updateFieldValue: { fontSize: 14, color: appColors.navy, lineHeight: 20 },
  updateTimestamp: { fontSize: 12, color: appColors.slate, marginTop: 2 },
  loadingText: { marginTop: 12, color: appColors.slate, fontSize: 15, textAlign: "center" },
  messageInput: { minHeight: 96, textAlignVertical: "top" },
  errorText: { color: appColors.red, marginBottom: 12, lineHeight: 20 },
});
