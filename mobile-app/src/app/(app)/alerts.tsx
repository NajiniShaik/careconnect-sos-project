import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useLocalSearchParams } from "expo-router";
import { AppButton, AppScreen, PageHeader, SectionCard, StatusBadge, appColors } from "../../components/common/designSystem";
import { getStoredUser } from "../../services/authService";
import { deleteSosAlert, fetchSosAlerts, fetchSosCategories, fetchSosMessages, mergeSosMessages, normalizeSosHistory, postSosMessage, resolveSosAlert, retrySosTranscription, updateSosIncident } from "../../services/sosService";

function normalizeCategoryValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getAlertCategoryValue(alert) {
  return alert?.category || alert?.category_name || alert?.categoryValue || alert?.category_label || "";
}

function isAlertOwnedByUser(alert = {}, user = null) {
  if (!user || !alert) {
    return false;
  }

  const residentUsername = String(user?.username || "").trim().toLowerCase();
  const residentId = String(user?.id || "").trim().toLowerCase();
  const ownerDetails = alert?.userDetails || {};
  const ownerValue = String(ownerDetails?.username || ownerDetails?.email || alert?.user || "").trim().toLowerCase();
  const ownerId = String(ownerDetails?.id || "").trim().toLowerCase();

  return ownerValue === residentUsername || ownerId === residentId;
}

function getCategoryDisplayName(category, categories = []) {
  const normalizedCategory = normalizeCategoryValue(category);

  if (!normalizedCategory) {
    return "Category unavailable";
  }

  const match = categories.find((item) => normalizeCategoryValue(item.value) === normalizedCategory);

  if (match?.label) {
    return match.label;
  }

  return String(category).trim();
}

function getStatusTone(status) {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "RESOLVED") {
    return "success";
  }

  if (normalized === "OPEN" || normalized === "PENDING") {
    return "danger";
  }

  if (normalized === "ACTIVE") {
    return "warning";
  }

  return "neutral";
}

function formatAlertTime(value) {
  if (!value) {
    return "Recently created";
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return value;
  }

  return dateValue.toLocaleString();
}

function sortMessagesForDisplay(messages = []) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left?.created_at || 0).getTime();
    const rightTime = new Date(right?.created_at || 0).getTime();

    return leftTime - rightTime;
  });
}

function getAlertIdentifier(alert = {}) {
  if (!alert || typeof alert !== "object") {
    return null;
  }

  return (
    alert.id ??
    alert.pk ??
    alert.alert_id ??
    alert.alertId ??
    null
  );
}

export default function AlertsRoute() {
  const params = useLocalSearchParams();
  const [user, setUser] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [expandedAlertId, setExpandedAlertId] = useState(null);
  const [messagesByAlert, setMessagesByAlert] = useState({});
  const [incidentDrafts, setIncidentDrafts] = useState({});
  const [messageDraftsByAlert, setMessageDraftsByAlert] = useState({});
  const [incidentCoordinatesByAlert, setIncidentCoordinatesByAlert] = useState({});
  const [messageLoadingByAlert, setMessageLoadingByAlert] = useState({});
  const [messagePostingByAlert, setMessagePostingByAlert] = useState({});
  const [locationLoadingByAlert, setLocationLoadingByAlert] = useState({});
  const [incidentUpdatingByAlert, setIncidentUpdatingByAlert] = useState({});
  const [messageErrorsByAlert, setMessageErrorsByAlert] = useState({});
  const [incidentSuccessByAlert, setIncidentSuccessByAlert] = useState({});
  const [messageSuccessByAlert, setMessageSuccessByAlert] = useState({});
  const [playingVoiceNoteUrl, setPlayingVoiceNoteUrl] = useState(null);
  const [transcriptionLoadingByAlert, setTranscriptionLoadingByAlert] = useState({});

  const voiceNotePlayer = useAudioPlayer(playingVoiceNoteUrl, { downloadFirst: true });
  const voiceNotePlayerStatus = useAudioPlayerStatus(voiceNotePlayer);

  const loadAlerts = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const storedUser = await getStoredUser();
      setUser(storedUser);

      const [alertsResult, categoriesResult] = await Promise.allSettled([
        fetchSosAlerts(),
        fetchSosCategories(),
      ]);

      const history = normalizeSosHistory(
        alertsResult.status === "fulfilled" ? alertsResult.value?.data || [] : []
      );
      const categoryList =
        categoriesResult.status === "fulfilled" && Array.isArray(categoriesResult.value?.data?.categories)
          ? categoriesResult.value.data.categories
          : [];

      setAlerts(history);
      setCategories(categoryList);
    } catch (error) {
      console.log("[alerts] Failed to load alerts", error);
      setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAlerts();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadAlerts]);

  const filteredAlerts = useMemo(() => {
    if (selectedCategory === "all") {
      return alerts;
    }

    return alerts.filter((alert) => normalizeCategoryValue(getAlertCategoryValue(alert)) === normalizeCategoryValue(selectedCategory));
  }, [alerts, selectedCategory]);

  const categoryLabel = useMemo(() => {
    if (selectedCategory === "all") {
      return "All alerts";
    }

    const match = categories.find((item) => normalizeCategoryValue(item.value) === normalizeCategoryValue(selectedCategory));
    return match?.label || selectedCategory;
  }, [categories, selectedCategory]);

  const role = String(user?.role || "").toUpperCase();
  const isAdmin = role === "ADMIN";
  const isSecurity = role === "SECURITY";
  const isResident = role === "RESIDENT";

  useEffect(() => {
    const selectedAlertId = String(params?.alert_id || params?.alertId || params?.alertid || "").trim();
    if (!selectedAlertId || !alerts.length) {
      return;
    }

    const found = alerts.some((alert) => String(getAlertIdentifier(alert)) === selectedAlertId);
    if (found) {
      setExpandedAlertId(selectedAlertId);
    }
  }, [alerts, params]);

  const handleResolveAlert = async (alert) => {
    const alertId = getAlertIdentifier(alert);
    console.log("[alerts] Resolve pressed", { alertId });

    if (!alertId) {
      console.log("[alerts] Resolve skipped: missing alert id", alert);
      return;
    }

    console.log("[alerts] Calling resolveAlert()", { alertId });
    setActionLoadingId(alertId);

    try {
      console.log("[alerts] resolveAlert: before service call", { alertId });
      const response = await resolveSosAlert(alertId, "RESOLVED");
      console.log("[alerts] resolveAlert: service returned", { alertId, status: response?.status, body: response?.data });
      await loadAlerts(true);
      console.log("[alerts] resolveAlert: list refreshed", { alertId });
    } catch (error) {
      console.log("[alerts] Failed to resolve alert", {
        alertId,
        status: error?.response?.status,
        body: error?.response?.data,
        message: error?.message,
      });
      Alert.alert("Unable to resolve", "The alert could not be updated right now.");
    } finally {
      setActionLoadingId(null);
      console.log("[alerts] resolveAlert: complete", { alertId });
    }
  };

  const handleDeleteAlert = async (alert) => {
    const alertId = getAlertIdentifier(alert);
    console.log("[alerts] Delete pressed", { alertId });

    if (!alertId) {
      console.log("[alerts] Delete skipped: missing alert id", alert);
      return;
    }

    console.log("[alerts] Calling deleteAlert()", { alertId });
    setActionLoadingId(alertId);

    try {
      console.log("[alerts] deleteAlert: before service call", { alertId });
      const response = await deleteSosAlert(alertId);
      console.log("[alerts] deleteAlert: service returned", { alertId, status: response?.status, body: response?.data });
      setAlerts((prev) => prev.filter((item) => String(item.id) !== String(alertId)));
      Alert.alert("Deleted", "The SOS alert was deleted.");
      await loadAlerts(true);
      console.log("[alerts] deleteAlert: list refreshed", { alertId });
    } catch (error) {
      console.log("[alerts] Failed to delete alert", {
        alertId,
        status: error?.response?.status,
        body: error?.response?.data,
        message: error?.message,
      });
      Alert.alert("Unable to delete", "The alert could not be deleted right now.");
    } finally {
      setActionLoadingId(null);
      console.log("[alerts] deleteAlert: complete", { alertId });
    }
  };

  const handleResidentDeleteAlert = async (alert) => {
    const alertId = getAlertIdentifier(alert);
    console.log("[alerts] Delete pressed", { alertId });

    if (!alertId) {
      console.log("[alerts] Resident delete skipped: missing alert id", alert);
      return;
    }

    console.log("[alerts] Calling deleteAlert()", { alertId });
    setActionLoadingId(alertId);

    try {
      console.log("[alerts] deleteAlert: before service call", { alertId });
      const response = await deleteSosAlert(alertId);
      console.log("[alerts] deleteAlert: service returned", { alertId, status: response?.status, body: response?.data });
      setAlerts((prev) => prev.filter((item) => String(item.id) !== String(alertId)));
      Alert.alert("Deleted", "The SOS alert was deleted.");
      await loadAlerts(true);
      console.log("[alerts] deleteAlert: list refreshed", { alertId });
    } catch (error) {
      console.log("[alerts] Failed to delete resident alert", {
        alertId,
        status: error?.response?.status,
        body: error?.response?.data,
        message: error?.message,
      });
      Alert.alert("Unable to delete", "The alert could not be deleted right now.");
    } finally {
      setActionLoadingId(null);
      console.log("[alerts] deleteAlert: complete", { alertId });
    }
  };

  const visibleAlerts = useMemo(() => {
    if (!isResident) {
      return filteredAlerts;
    }

    return filteredAlerts.filter((alert) => isAlertOwnedByUser(alert, user));
  }, [filteredAlerts, isResident, user]);

  const loadAlertMessages = useCallback(async (alertId) => {
    if (!alertId) {
      return;
    }

    setMessageLoadingByAlert((prev) => ({ ...prev, [alertId]: true }));
    setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "" }));

    try {
      const response = await fetchSosMessages(alertId);
      const messages = Array.isArray(response?.data) ? response.data : [];
      setMessagesByAlert((prev) => ({ ...prev, [alertId]: messages }));
    } catch (error) {
      console.log("[alerts] Failed to load incident updates", error);
      setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "Unable to load incident updates." }));
    } finally {
      setMessageLoadingByAlert((prev) => ({ ...prev, [alertId]: false }));
    }
  }, []);

  const handleToggleAlertMessages = useCallback(async (alert) => {
    const canViewAlertUpdates = isAdmin || isSecurity || (isResident && isAlertOwnedByUser(alert, user));

    if (!alert?.id || !canViewAlertUpdates) {
      return;
    }

    const alertId = String(alert.id);
    if (expandedAlertId === alertId) {
      setExpandedAlertId(null);
      return;
    }

    setExpandedAlertId(alertId);
    if (!messagesByAlert[alertId]) {
      await loadAlertMessages(alertId);
    }
  }, [expandedAlertId, isAdmin, isResident, isSecurity, loadAlertMessages, messagesByAlert, user]);

  const handlePostMessage = useCallback(async (alert) => {
    if (!alert?.id || !isAlertOwnedByUser(alert, user)) {
      return;
    }

    const alertId = String(alert.id);
    const draftMessage = String(messageDraftsByAlert[alertId] ?? "").trim();

    if (!draftMessage) {
      setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "Enter a message before posting it to the timeline." }));
      return;
    }

    setMessagePostingByAlert((prev) => ({ ...prev, [alertId]: true }));
    setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "" }));
    setMessageSuccessByAlert((prev) => ({ ...prev, [alertId]: "" }));

    try {
      const response = await postSosMessage(alert.id, draftMessage);
      const postedMessage = response?.data || null;

      if (postedMessage) {
        setMessagesByAlert((prev) => ({
          ...prev,
          [alertId]: mergeSosMessages(prev[alertId] || [], postedMessage),
        }));
      }

      setMessageDraftsByAlert((prev) => ({ ...prev, [alertId]: "" }));
      await loadAlertMessages(alert.id);
      setMessageSuccessByAlert((prev) => ({ ...prev, [alertId]: "Message added to the incident timeline." }));
    } catch (error) {
      console.log("[alerts] Failed to post incident message", error);
      setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "Unable to add the message right now." }));
    } finally {
      setMessagePostingByAlert((prev) => ({ ...prev, [alertId]: false }));
    }
  }, [loadAlertMessages, messageDraftsByAlert, user]);

  const handleRefreshLocation = useCallback(async (alert) => {
    if (!alert?.id || !isAlertOwnedByUser(alert, user)) {
      return;
    }

    const alertId = String(alert.id);
    setLocationLoadingByAlert((prev) => ({ ...prev, [alertId]: true }));
    setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "" }));

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "Location permission is required to refresh GPS." }));
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setIncidentCoordinatesByAlert((prev) => ({
        ...prev,
        [alertId]: {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        },
      }));
    } catch (error) {
      console.log("[alerts] Failed to refresh incident location", error);
      setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "Unable to refresh location right now." }));
    } finally {
      setLocationLoadingByAlert((prev) => ({ ...prev, [alertId]: false }));
    }
  }, [user]);

  const handleRetryTranscription = useCallback(async (alert) => {
    if (!alert?.id) {
      return;
    }

    const alertId = String(alert.id);
    setTranscriptionLoadingByAlert((prev) => ({ ...prev, [alertId]: true }));

    try {
      const response = await retrySosTranscription(alert.id);
      const latestMessage = response?.data || null;
      if (latestMessage) {
        setMessagesByAlert((prev) => ({ ...prev, [alertId]: mergeSosMessages(prev[alertId] || [], latestMessage) }));
      }
      await loadAlerts(true);
    } catch (error) {
      console.log("[alerts] Failed to retry transcription", error);
      setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "Transcript unavailable." }));
    } finally {
      setTranscriptionLoadingByAlert((prev) => ({ ...prev, [alertId]: false }));
    }
  }, [loadAlerts]);

  useEffect(() => {
    if (!playingVoiceNoteUrl) {
      return undefined;
    }

    if (voiceNotePlayerStatus?.isLoaded) {
      void voiceNotePlayer?.play?.();
    }
  }, [playingVoiceNoteUrl, voiceNotePlayerStatus, voiceNotePlayer]);

  const handlePlayVoiceNote = useCallback(async (audioUrl) => {
    if (!audioUrl) {
      return;
    }

    try {
      if (playingVoiceNoteUrl === audioUrl) {
        if (voiceNotePlayerStatus?.playing && voiceNotePlayerStatus?.isLoaded) {
          await voiceNotePlayer?.pause?.();
          setPlayingVoiceNoteUrl(null);
        } else if (voiceNotePlayerStatus?.isLoaded) {
          await voiceNotePlayer?.play?.();
        }
        return;
      }

      if (voiceNotePlayerStatus?.playing && voiceNotePlayerStatus?.isLoaded) {
        await voiceNotePlayer?.pause?.();
      }

      setPlayingVoiceNoteUrl(audioUrl);
    } catch (error) {
      console.log("[alerts] Failed to play voice note", error);
      Alert.alert("Playback failed", "Unable to play the voice note right now.");
    }
  }, [playingVoiceNoteUrl, voiceNotePlayer, voiceNotePlayerStatus]);

  const handleUpdateIncident = useCallback(async (alert) => {
    if (!alert?.id || !isAlertOwnedByUser(alert, user)) {
      return;
    }

    const alertId = String(alert.id);
    const draftMessage = String(incidentDrafts[alertId] ?? alert.message ?? "").trim();
    const coordinates = incidentCoordinatesByAlert[alertId] || {
      latitude: alert.latitude,
      longitude: alert.longitude,
    };

    const message = draftMessage || String(alert.message || "").trim();
    if (!message) {
      setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "Enter an emergency description before updating." }));
      return;
    }

    setIncidentUpdatingByAlert((prev) => ({ ...prev, [alertId]: true }));
    setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "" }));
    setIncidentSuccessByAlert((prev) => ({ ...prev, [alertId]: "" }));

    try {
      const payload = {
        message,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
      };

      console.log("[alerts] update incident", { alertId, payload });
      const response = await updateSosIncident(alert.id, payload);

      const updatedAlert = response?.data || null;
      if (updatedAlert) {
        setAlerts((prev) => prev.map((item) => (String(item.id) === String(alert.id) ? {
          ...item,
          ...updatedAlert,
          message: updatedAlert.message || item.message,
          latitude: updatedAlert.latitude ?? item.latitude,
          longitude: updatedAlert.longitude ?? item.longitude,
          address: updatedAlert.address ?? item.address,
          location: updatedAlert.location || item.location,
        } : item)));
      }

      setIncidentDrafts((prev) => ({ ...prev, [alertId]: "" }));
      setIncidentCoordinatesByAlert((prev) => ({
        ...prev,
        [alertId]: {
          latitude: updatedAlert?.latitude ?? coordinates?.latitude,
          longitude: updatedAlert?.longitude ?? coordinates?.longitude,
        },
      }));
      await loadAlerts(true);
      setIncidentSuccessByAlert((prev) => ({ ...prev, [alertId]: "Incident updated successfully." }));
    } catch (error) {
      console.log("[alerts] Failed to update incident", error);
      setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "Unable to update incident right now." }));
    } finally {
      setIncidentUpdatingByAlert((prev) => ({ ...prev, [alertId]: false }));
    }
  }, [incidentCoordinatesByAlert, incidentDrafts, loadAlerts, user]);

  return (
    <AppScreen scrollable={false}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadAlerts(true)} tintColor={appColors.blue} />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader eyebrow="Emergency alerts" title="Alerts" subtitle="Browse resident alerts by category." />

        <SectionCard title="Categories" subtitle="Choose a category to focus the list." style={styles.cardSpacing}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            <Pressable
              style={[styles.categoryChip, selectedCategory === "all" && styles.categoryChipActive]}
              onPress={() => setSelectedCategory("all")}
            >
              <Text style={[styles.categoryChipText, selectedCategory === "all" && styles.categoryChipTextActive]}>All</Text>
            </Pressable>

            {categories.map((item) => {
              const isActive = normalizeCategoryValue(selectedCategory) === normalizeCategoryValue(item.value);

              return (
                <Pressable
                  key={item.value}
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => setSelectedCategory(item.value)}
                >
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </SectionCard>

        <SectionCard title="Recent alerts" subtitle={categoryLabel} style={styles.cardSpacing}>
          {loading && !refreshing ? (
            <Text style={styles.emptyText}>Loading alerts...</Text>
          ) : visibleAlerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No alerts available for this category.</Text>
              <Text style={styles.emptyDescription}>Try a different category or pull to refresh.</Text>
            </View>
          ) : (
            <View style={styles.alertListContent}>
              {visibleAlerts.map((alert) => {
                const canViewAlertUpdates = isAdmin || isSecurity || (isResident && isAlertOwnedByUser(alert, user));

                return (
                  <View key={alert.id || `${alert.message}-${alert.created_at}`} style={styles.alertCard}>
                    <View style={styles.alertHeaderRow}>
                      <View style={styles.badgeRow}>
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryBadgeText}>{getCategoryDisplayName(getAlertCategoryValue(alert), categories)}</Text>
                        </View>
                        <StatusBadge label={String(alert.status || "OPEN").toUpperCase()} tone={getStatusTone(alert.status)} compact />
                      </View>
                    </View>

                    <Text style={styles.alertMessage}>{alert.message || "Emergency alert"}</Text>
                    {isSecurity || isAdmin ? (
                      <View style={styles.userMetaWrap}>
                        <Text style={styles.metaText}>Resident: {alert.user || "Unknown"}</Text>
                        {alert.location ? <Text style={styles.metaText}>Location: {alert.location}</Text> : null}
                      </View>
                    ) : null}
                    <Text style={styles.metaText}>{formatAlertTime(alert.created_at)}</Text>
                    {alert.location && !(isSecurity || isAdmin) ? <Text style={styles.metaText}>{alert.location}</Text> : null}
                    {isAdmin ? (
                      <View style={styles.actionRow}>
                        <AppButton
                          title={actionLoadingId === getAlertIdentifier(alert) ? "Working..." : "Resolve"}
                          onPress={() => {
                            const alertId = getAlertIdentifier(alert);
                            console.log("[alerts] Resolve button tapped", { alertId });
                            void handleResolveAlert(alert);
                          }}
                          variant="secondary"
                          style={styles.actionButton}
                          loading={actionLoadingId === getAlertIdentifier(alert)}
                        />
                        <AppButton
                          title={actionLoadingId === getAlertIdentifier(alert) ? "Working..." : "Delete"}
                          onPress={() => {
                            const alertId = getAlertIdentifier(alert);
                            console.log("[alerts] Delete button tapped", { alertId });
                            void handleDeleteAlert(alert);
                          }}
                          variant="danger"
                          style={styles.actionButton}
                          loading={actionLoadingId === getAlertIdentifier(alert)}
                        />
                      </View>
                    ) : null}
                    {canViewAlertUpdates ? (
                      <>
                        <View style={styles.updateSection}>
                          <Pressable style={styles.updateToggle} onPress={() => void handleToggleAlertMessages(alert)}>
                            <Text style={styles.updateTitle}>Incident Updates</Text>
                            <Text style={styles.updateHint}>{expandedAlertId === String(alert.id) ? "Hide" : "Show"}</Text>
                          </Pressable>

                          {expandedAlertId === String(alert.id) ? (
                            <View style={styles.updateContent}>
                              {messageLoadingByAlert[String(alert.id)] ? (
                                <Text style={styles.emptyText}>Loading updates...</Text>
                              ) : (messagesByAlert[String(alert.id)] || []).length === 0 ? (
                                <Text style={styles.emptyText}>No incident updates yet.</Text>
                              ) : (
                                <View style={styles.messageList}>
                                  {sortMessagesForDisplay(messagesByAlert[String(alert.id)] || []).map((message) => (
                                    <View key={message.id || `${message.created_at}-${message.message}`} style={styles.messageBubble}>
                                      <Text style={styles.messageText}>{message.message}</Text>
                                      {message.audio_url ? (
                                        <View style={styles.voiceNoteRow}>
                                          <AppButton
                                            title={playingVoiceNoteUrl === message.audio_url && voiceNotePlayer?.playing ? "Pause voice note" : "Play voice note"}
                                            onPress={() => void handlePlayVoiceNote(message.audio_url)}
                                            variant="secondary"
                                            style={styles.actionButton}
                                          />
                                        </View>
                                      ) : null}
                                      {message.audio_url ? (
                                        <View style={styles.voiceNoteRow}>
                                          {message.transcription_status === "PENDING" ? (
                                            <Text style={styles.transcriptText}>Transcribing...</Text>
                                          ) : message.transcript ? (
                                            <Text style={styles.transcriptText}>Transcript: {message.transcript}</Text>
                                          ) : (
                                            <View style={styles.voiceNoteRow}>
                                              <Text style={styles.transcriptText}>Transcript unavailable.</Text>
                                              <AppButton title="Retry transcription" onPress={() => void handleRetryTranscription(alert)} variant="secondary" style={styles.actionButton} loading={transcriptionLoadingByAlert[String(alert.id)]} />
                                            </View>
                                          )}
                                        </View>
                                      ) : null}
                                      <Text style={styles.messageMeta}>{message.sender?.username || "Resident"} • {formatAlertTime(message.created_at)}</Text>
                                    </View>
                                  ))}
                                </View>
                              )}

                              {isResident && isAlertOwnedByUser(alert, user) ? (
                                <View style={styles.updateForm}>
                                  <View style={styles.locationBlock}>
                                    <Text style={styles.fieldLabel}>Current address</Text>
                                    <Text style={styles.locationValue}>{alert.address || alert.location || "Address unavailable"}</Text>
                                    <Text style={styles.locationValue}>
                                      Lat: {Number.isFinite(incidentCoordinatesByAlert[String(alert.id)]?.latitude ?? alert.latitude) ? String(incidentCoordinatesByAlert[String(alert.id)]?.latitude ?? alert.latitude) : "—"} • Lon: {Number.isFinite(incidentCoordinatesByAlert[String(alert.id)]?.longitude ?? alert.longitude) ? String(incidentCoordinatesByAlert[String(alert.id)]?.longitude ?? alert.longitude) : "—"}
                                    </Text>
                                  </View>

                                  <View style={styles.actionRow}>
                                    <AppButton
                                      title={locationLoadingByAlert[String(alert.id)] ? "Refreshing..." : "Refresh Location"}
                                      onPress={() => void handleRefreshLocation(alert)}
                                      variant="secondary"
                                      style={styles.actionButton}
                                      loading={locationLoadingByAlert[String(alert.id)]}
                                    />
                                  </View>

                                  <Text style={styles.fieldLabel}>Add message</Text>
                                  <TextInput
                                    style={styles.messageInput}
                                    placeholder="Add an update for the incident timeline"
                                    placeholderTextColor={appColors.muted}
                                    value={messageDraftsByAlert[String(alert.id)] ?? ""}
                                    onChangeText={(value) => setMessageDraftsByAlert((prev) => ({ ...prev, [String(alert.id)]: value.slice(0, 500) }))}
                                    multiline
                                    maxLength={500}
                                  />
                                  <AppButton
                                    title={messagePostingByAlert[String(alert.id)] ? "Posting..." : "Add Message"}
                                    onPress={() => void handlePostMessage(alert)}
                                    variant="secondary"
                                    style={styles.sendButton}
                                    loading={messagePostingByAlert[String(alert.id)]}
                                  />

                                  <Text style={styles.fieldLabel}>Emergency Description</Text>
                                  <TextInput
                                    style={styles.messageInput}
                                    placeholder="Describe the incident"
                                    placeholderTextColor={appColors.muted}
                                    value={incidentDrafts[String(alert.id)] ?? alert.message ?? ""}
                                    onChangeText={(value) => setIncidentDrafts((prev) => ({ ...prev, [String(alert.id)]: value.slice(0, 500) }))}
                                    multiline
                                    maxLength={500}
                                  />

                                  <AppButton
                                    title={incidentUpdatingByAlert[String(alert.id)] ? "Updating..." : "Update Incident"}
                                    onPress={() => void handleUpdateIncident(alert)}
                                    variant="primary"
                                    style={styles.sendButton}
                                    loading={incidentUpdatingByAlert[String(alert.id)]}
                                  />
                                </View>
                              ) : null}

                              {messageSuccessByAlert[String(alert.id)] ? <Text style={styles.successText}>{messageSuccessByAlert[String(alert.id)]}</Text> : null}
                              {incidentSuccessByAlert[String(alert.id)] ? <Text style={styles.successText}>{incidentSuccessByAlert[String(alert.id)]}</Text> : null}
                              {messageErrorsByAlert[String(alert.id)] ? <Text style={styles.messageError}>{messageErrorsByAlert[String(alert.id)]}</Text> : null}
                            </View>
                          ) : null}
                        </View>
                      </>
                    ) : null}

                    {isResident && isAlertOwnedByUser(alert, user) ? (
                      <View style={styles.actionRow}>
                        <AppButton
                          title={actionLoadingId === getAlertIdentifier(alert) ? "Working..." : "Delete"}
                          onPress={() => {
                            const alertId = getAlertIdentifier(alert);
                            console.log("[alerts] Delete button tapped", { alertId });
                            void handleResidentDeleteAlert(alert);
                          }}
                          variant="danger"
                          style={styles.actionButton}
                          loading={actionLoadingId === getAlertIdentifier(alert)}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </SectionCard>

        <SectionCard title="Support contacts" subtitle="Reach out for help if needed." style={styles.cardSpacing}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Society guard</Text>
            <Text style={styles.detailValue}>+91 98765 43210</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Emergency helpline</Text>
            <Text style={styles.detailValue}>112</Text>
          </View>
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  pageScroll: { flex: 1, backgroundColor: appColors.mist },
  pageContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 96 },
  cardSpacing: { marginBottom: 14 },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 4 },
  categoryChip: { borderWidth: 1, borderColor: appColors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, backgroundColor: appColors.white },
  categoryChipActive: { borderColor: appColors.blue, backgroundColor: appColors.blueSoft },
  categoryChipText: { color: appColors.slate, fontSize: 13, fontWeight: "700" },
  categoryChipTextActive: { color: appColors.blue },
  alertListContent: { paddingBottom: 8 },
  alertCard: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 12, marginTop: 10, backgroundColor: "#fafcff" },
  alertHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  categoryBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: appColors.blueSoft },
  categoryBadgeText: { color: appColors.blue, fontSize: 12, fontWeight: "700" },
  alertMessage: { color: appColors.navy, fontSize: 15, fontWeight: "700", marginBottom: 6, lineHeight: 20 },
  userMetaWrap: { marginTop: 4 },
  metaText: { color: appColors.muted, fontSize: 12, marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionButton: { flex: 1 },
  updateSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: appColors.border, paddingTop: 10 },
  updateToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  updateTitle: { color: appColors.navy, fontSize: 13, fontWeight: "700" },
  updateHint: { color: appColors.blue, fontSize: 12, fontWeight: "700" },
  updateContent: { gap: 8 },
  messageList: { gap: 8 },
  messageBubble: { borderRadius: 10, padding: 10, backgroundColor: appColors.white, borderWidth: 1, borderColor: appColors.border },
  messageText: { color: appColors.navy, fontSize: 13, lineHeight: 18 },
  messageMeta: { color: appColors.muted, fontSize: 11, marginTop: 4 },
  updateForm: { gap: 8 },
  voiceNoteRow: { marginTop: 8 },
  transcriptText: { color: appColors.slate, fontSize: 12, lineHeight: 18 },
  locationBlock: { borderRadius: 10, padding: 10, backgroundColor: appColors.white, borderWidth: 1, borderColor: appColors.border },
  fieldLabel: { color: appColors.navy, fontSize: 12, fontWeight: "700" },
  locationValue: { color: appColors.slate, fontSize: 12, marginTop: 4 },
  messageInput: { flex: 1, borderWidth: 1, borderColor: appColors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minHeight: 44, color: appColors.navy, backgroundColor: appColors.white },
  sendButton: { minWidth: 84 },
  messageError: { color: appColors.red, fontSize: 12 },
  successText: { color: appColors.blue, fontSize: 12 },
  emptyState: { paddingVertical: 16, alignItems: "center" },
  emptyTitle: { color: appColors.navy, fontSize: 15, fontWeight: "700" },
  emptyDescription: { color: appColors.slate, marginTop: 6, textAlign: "center" },
  emptyText: { color: appColors.slate, paddingVertical: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: appColors.border },
  detailLabel: { color: appColors.slate },
  detailValue: { color: appColors.navy, fontWeight: "700" },
});
