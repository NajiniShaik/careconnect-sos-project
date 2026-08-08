import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppButton, AppScreen, PageHeader, SectionCard, StatusBadge, appColors } from "../../components/common/designSystem";
import { getStoredUser, getErrorMessage } from "../../services/authService";
import { broadcastSosAlert } from "../../services/notificationService";
import { declineSosAlert, deleteSosAlert, fetchSosAlert, fetchSosAlerts, fetchSosCategories, fetchSosMessages, fetchSosUpdates, mergeSosMessages, navigateToSosLocation, normalizeSosHistory, openSosLocation, postSosMessage, respondToSosAlert, resolveSosAlert, closeSosAlert, retrySosTranscription, updateSosIncident, getSosStatusLabel, subscribeToSosUpdates } from "../../services/sosService";

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

function resolveAssignedVolunteerIdentity(alert = {}) {
  const assigned =
    alert?.assigned_volunteer ??
    alert?.assignedVolunteer ??
    alert?.assigned_volunteer_id ??
    alert?.assignedVolunteerId ??
    alert?.assigned_volunteer_name ??
    alert?.assignedVolunteerName ??
    null;
  if (!assigned) {
    return { id: "", username: "", email: "", label: "" };
  }

  if (typeof assigned === "object") {
    const id = String(assigned.id ?? assigned.pk ?? "").trim().toLowerCase();
    const username = String(assigned.username ?? assigned.name ?? "").trim().toLowerCase();
    const email = String(assigned.email ?? "").trim().toLowerCase();
    const label = String(assigned.username ?? assigned.name ?? assigned.email ?? assigned.id ?? "").trim().toLowerCase();
    return { id, username, email, label };
  }

  const value = String(assigned).trim().toLowerCase();
  return { id: value, username: value, email: value, label: value };
}

function isAlertAssignedToUser(alert = {}, user = null) {
  if (!user || !alert) {
    return false;
  }

  const assigned = resolveAssignedVolunteerIdentity(alert);
  const userId = String(user?.id ?? "").trim().toLowerCase();
  const userUsername = String(user?.username ?? user?.name ?? "").trim().toLowerCase();
  const userEmail = String(user?.email ?? "").trim().toLowerCase();

  return Boolean(
    (assigned.id && userId && assigned.id === userId) ||
    (assigned.username && userUsername && assigned.username === userUsername) ||
    (assigned.email && userEmail && assigned.email === userEmail) ||
    (assigned.label && (assigned.label === userUsername || assigned.label === userEmail))
  );
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

function getAlertResidentPhone(alert = {}) {
  return (
    alert.residentPhone ||
    alert.userDetails?.phone ||
    alert.userDetails?.phone_number ||
    alert.userDetails?.mobile ||
    alert.userDetails?.contact_number ||
    ""
  );
}

function getAlertUserLabel(alert = {}) {
  const user = alert?.user;

  if (!user) {
    return "Unknown";
  }

  if (typeof user === "string") {
    return user;
  }

  if (typeof user === "object") {
    return (
      user.username ||
      user.name ||
      user.email ||
      (user.id ? `User #${user.id}` : "Unknown") ||
      "Unknown"
    );
  }

  return "Unknown";
}

function getAssignedVolunteerLabel(alert = {}, user = null) {
  const assignedId = alert.assigned_volunteer_id || alert.assigned_volunteer || null;
  const assignedName = alert.assigned_volunteer_name || (typeof alert.assigned_volunteer === "string" ? alert.assigned_volunteer : "");

  if (assignedId && user && user.id && String(user.id) === String(assignedId)) {
    return "You";
  }

  if (assignedName) {
    return assignedName;
  }

  if (assignedId) {
    return String(assignedId);
  }

  return "Unassigned";
}

function getIncidentLocationDetail(alert = {}) {
  const parts = [];
  if (alert.society) parts.push(alert.society);
  if (alert.blockFlat) parts.push(alert.blockFlat);
  if (alert.address) parts.push(alert.address);
  const location = parts.join(" • ");
  return location || alert.location || "";
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

function isClosedAlert(alert = {}) {
  const status = String(alert?.status || "").toUpperCase();
  const currentStatus = String(alert?.current_status || "").toUpperCase();

  return status === "CLOSED" || currentStatus === "INCIDENT_CLOSED";
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
    alert.alertid ??
    null
  );
}

export default function AlertsRoute() {
  const params = useLocalSearchParams();
  const router = useRouter();
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
  const [closureNotesByAlert, setClosureNotesByAlert] = useState({});
  const [resolutionSummaryByAlert, setResolutionSummaryByAlert] = useState({});
  const [actionsTakenByAlert, setActionsTakenByAlert] = useState({});
  const [additionalRemarksByAlert, setAdditionalRemarksByAlert] = useState({});
  const [closureLoadingByAlert, setClosureLoadingByAlert] = useState({});
  const [closureErrorsByAlert, setClosureErrorsByAlert] = useState({});
  const [closureSuccessByAlert, setClosureSuccessByAlert] = useState({});
  const [messageErrorsByAlert, setMessageErrorsByAlert] = useState({});
  const [incidentSuccessByAlert, setIncidentSuccessByAlert] = useState({});
  const [messageSuccessByAlert, setMessageSuccessByAlert] = useState({});
  const [playingVoiceNoteUrl, setPlayingVoiceNoteUrl] = useState(null);
  const [transcriptionLoadingByAlert, setTranscriptionLoadingByAlert] = useState({});
  const [guardianResponseStateByAlert, setGuardianResponseStateByAlert] = useState({});
  const [guardianResponseLoadingByAlert, setGuardianResponseLoadingByAlert] = useState({});
  const [guardianResponseErrorByAlert, setGuardianResponseErrorByAlert] = useState({});
  const [guardianResponseSuccessByAlert, setGuardianResponseSuccessByAlert] = useState({});
  const [broadcastingAlertId, setBroadcastingAlertId] = useState(null);

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
  const isVolunteer = role === "VOLUNTEER";
  const isResident = role === "RESIDENT";
  const isGuardian = role === "GUARDIAN";

  const selectedAlertId = String(params?.alert_id || params?.alertId || params?.alertid || "").trim();

  useEffect(() => {
    if (!selectedAlertId) {
      return;
    }

    void loadAlerts(true);
  }, [selectedAlertId, loadAlerts]);

  useEffect(() => {
    if (!selectedAlertId || !alerts.length) {
      return;
    }

    const found = alerts.some((alert) => String(getAlertIdentifier(alert)) === selectedAlertId);
    if (found) {
      setExpandedAlertId(selectedAlertId);
    }
  }, [alerts, selectedAlertId]);

  const loadSelectedAlertDetail = useCallback(async (alertId) => {
    if (!alertId) {
      return;
    }

    try {
      const response = await fetchSosAlert(alertId);
      const normalizedDetail = normalizeSosHistory(Array.isArray(response?.data) ? response.data : [response?.data])[0] || null;
      if (!normalizedDetail) {
        return;
      }

      setAlerts((prev) => {
        const existing = prev.filter((item) => String(getAlertIdentifier(item)) !== String(alertId));
        return [normalizedDetail, ...existing];
      });
    } catch (error) {
      console.log("[alerts] Failed to refresh selected alert detail", { alertId, error });
    }
  }, []);

  useEffect(() => {
    if (!selectedAlertId || !alerts.length) {
      return;
    }

    void loadSelectedAlertDetail(selectedAlertId);
  }, [selectedAlertId, alerts.length, loadSelectedAlertDetail]);

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

  const handleCloseIncident = async (alert) => {
    const alertId = getAlertIdentifier(alert);
    console.log("[alerts] Close incident pressed", { alertId });

    if (!alertId) {
      console.log("[alerts] Close incident skipped: missing alert id", alert);
      return;
    }

    const closurePayload = {
      closure_notes: String(closureNotesByAlert[alertId] ?? alert.closure_notes ?? "").trim(),
      resolution_summary: String(resolutionSummaryByAlert[alertId] ?? alert.resolution_summary ?? "").trim(),
      actions_taken: String(actionsTakenByAlert[alertId] ?? alert.actions_taken ?? "").trim(),
      additional_remarks: String(additionalRemarksByAlert[alertId] ?? alert.additional_remarks ?? "").trim(),
    };

    if (!closurePayload.closure_notes && !closurePayload.resolution_summary && !closurePayload.actions_taken && !closurePayload.additional_remarks) {
      setClosureErrorsByAlert((prev) => ({ ...prev, [alertId]: "Provide at least one closure detail before closing the incident." }));
      return;
    }

    setClosureLoadingByAlert((prev) => ({ ...prev, [alertId]: true }));
    setClosureErrorsByAlert((prev) => ({ ...prev, [alertId]: "" }));
    setClosureSuccessByAlert((prev) => ({ ...prev, [alertId]: "" }));

    try {
      const response = await closeSosAlert(alertId, closurePayload);
      console.log("[alerts] closeIncident: service returned", { alertId, status: response?.status, body: response?.data });

      const updatedAlert = response?.data || null;
      if (updatedAlert) {
        setAlerts((prev) => prev.map((item) => (String(item.id) === String(alert.id) ? { ...item, ...updatedAlert } : item)));
      }

      await loadAlerts(true);
      setClosureSuccessByAlert((prev) => ({ ...prev, [alertId]: "Incident closed successfully." }));
    } catch (error) {
      console.log("[alerts] Failed to close incident", {
        alertId,
        status: error?.response?.status,
        body: error?.response?.data,
        message: error?.message,
      });
      setClosureErrorsByAlert((prev) => ({ ...prev, [alertId]: "Unable to close the incident right now." }));
      Alert.alert("Unable to close", "The incident could not be closed right now.");
    } finally {
      setClosureLoadingByAlert((prev) => ({ ...prev, [alertId]: false }));
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

  const logsForSelectedAlert = useMemo(() => {
    if (!selectedAlertId) return null;
    const selected = filteredAlerts.find((alert) => String(getAlertIdentifier(alert)) === selectedAlertId);
    if (!selected) return null;
    return {
      role,
      selectedAlertId,
      expandedAlertId,
      assignedVolunteer: selected.assigned_volunteer_id ?? selected.assigned_volunteer,
      status: selected.status,
      current_status: selected.current_status,
      canViewAlertUpdates: Boolean(selected?.id),
      messagesLoaded: Boolean(messagesByAlert[selectedAlertId]),
      messagesCount: Array.isArray(messagesByAlert[selectedAlertId]) ? messagesByAlert[selectedAlertId].length : 0,
    };
  }, [filteredAlerts, selectedAlertId, expandedAlertId, messagesByAlert]);

  useEffect(() => {
    if (logsForSelectedAlert) {
      console.log("[alerts] selected alert state", logsForSelectedAlert);
    }
  }, [logsForSelectedAlert]);

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
    const alertId = String(getAlertIdentifier(alert) || "");
    const canViewAlertUpdates = Boolean(alertId);

    console.log("[alerts] toggle messages", {
      role,
      selectedAlertId,
      expandedAlertId,
      canViewAlertUpdates,
      alertId,
      assignedVolunteer: alert?.assigned_volunteer_id ?? alert?.assigned_volunteer,
      status: alert?.status,
      current_status: alert?.current_status,
      hasMessages: Boolean(messagesByAlert[alertId]),
      messagesCount: Array.isArray(messagesByAlert[alertId]) ? messagesByAlert[alertId].length : 0,
    });

    if (!alertId || !canViewAlertUpdates) {
      return;
    }

    if (expandedAlertId === alertId) {
      setExpandedAlertId(null);
      return;
    }

    setExpandedAlertId(alertId);
    if (!messagesByAlert[alertId]) {
      await loadAlertMessages(alertId);
    }
  }, [expandedAlertId, loadAlertMessages, messagesByAlert]);

  useEffect(() => {
    if (!expandedAlertId) {
      return;
    }

    console.log("[alerts] load messages effect", {
      role,
      selectedAlertId,
      expandedAlertId,
      hasMessages: Boolean(messagesByAlert[expandedAlertId]),
      messagesCount: Array.isArray(messagesByAlert[expandedAlertId]) ? messagesByAlert[expandedAlertId].length : 0,
    });

    if (!messagesByAlert[expandedAlertId]) {
      void loadAlertMessages(expandedAlertId);
    }
  }, [expandedAlertId, loadAlertMessages, messagesByAlert, role, selectedAlertId]);

  useEffect(() => {
    const unsub = subscribeToSosUpdates((sosId, update) => {
      setMessagesByAlert((prev) => {
        if (!prev || !prev[sosId]) return prev;
        const existing = prev[sosId] || [];
        const next = mergeSosMessages(existing, update);
        return { ...prev, [sosId]: next };
      });
    });

    return () => {
      try { unsub(); } catch (e) {}
    };
  }, []);

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

      setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: "" }));
      setMessageLoadingByAlert((prev) => ({ ...prev, [alertId]: true }));

      try {
        // Fetch chat messages
        const chatResp = await fetchSosMessages(alertId);
        const chatMessages = Array.isArray(chatResp?.data) ? chatResp.data : [];

        // Fetch responder updates and normalize to chat-like shape for preview
        let updateItems = [];
        try {
          const updatesResp = await fetchSosUpdates(alertId);
          updateItems = Array.isArray(updatesResp?.data) ? updatesResp.data.map((u) => ({
            id: u.id,
            message: u.message,
            sender: u.user || null,
            role: u.role || null,
            update_type: u.update_type || null,
            created_at: u.created_at || u.createdAt || null,
          })) : [];
        } catch (e) {
          // If updates fetch fails silently, keep chat messages
          updateItems = [];
        }

        // Merge both sets so alert preview shows both chat and response updates
        const combined = [...chatMessages, ...updateItems];
        setMessagesByAlert((prev) => ({ ...prev, [alertId]: combined }));
      } catch (err) {
        setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: getErrorMessage(err) || "Unable to load incident updates right now." }));
      } finally {
        setMessageLoadingByAlert((prev) => ({ ...prev, [alertId]: false }));
      }
    } catch (postErr) {
      console.log("[alerts] Failed to post message", postErr);
      setMessageErrorsByAlert((prev) => ({ ...prev, [alertId]: getErrorMessage(postErr) || "Unable to post the message right now." }));
    } finally {
      setMessagePostingByAlert((prev) => ({ ...prev, [alertId]: false }));
    }
  }, []);

  const handleBroadcastAlert = useCallback(async (alert) => {
    const alertId = getAlertIdentifier(alert);
    if (!alertId) {
      Alert.alert("Unable to broadcast", "This incident does not have a valid id.");
      return;
    }

    if (broadcastingAlertId === String(alertId)) {
      return;
    }

    setBroadcastingAlertId(String(alertId));

    try {
      const response = await broadcastSosAlert(alertId, false);
      const summary = response?.data || {};
      const recipientSummary = [
        summary?.volunteers ? `${summary.volunteers} volunteer(s)` : null,
        summary?.security ? `${summary.security} security` : null,
        summary?.residents ? `${summary.residents} resident(s)` : null,
      ].filter(Boolean).join(", ");
      const message = recipientSummary ? `Broadcast started for ${recipientSummary}.` : "Broadcast started.";
      Alert.alert("Broadcast started", message);
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.response?.data?.message || "Unable to broadcast the alert right now.";
      Alert.alert("Unable to broadcast", detail);
    } finally {
      setBroadcastingAlertId(null);
    }
  }, [broadcastingAlertId]);

  const handleGuardianRespond = useCallback(async (alert, action = "accept") => {
    const alertId = getAlertIdentifier(alert);
    if (!alertId) {
      return;
    }

    const alertKey = String(alertId);
    if (guardianResponseStateByAlert[alertKey]?.status) {
      return;
    }

    setGuardianResponseLoadingByAlert((prev) => ({ ...prev, [alertKey]: true }));
    setGuardianResponseErrorByAlert((prev) => ({ ...prev, [alertKey]: "" }));
    setGuardianResponseSuccessByAlert((prev) => ({ ...prev, [alertKey]: "" }));

    try {
      const response = action === "decline"
        ? await declineSosAlert(alertId, "decline")
        : await respondToSosAlert(alertId, "accept");

      const responseData = response?.data || {};
      const successMessage = action === "decline"
        ? "You marked the SOS as unable to respond."
        : "You accepted the SOS response request.";

      setGuardianResponseStateByAlert((prev) => ({
        ...prev,
        [alertKey]: {
          status: action === "decline" ? "declined" : "accepted",
          message: responseData?.message || successMessage,
        },
      }));
      setGuardianResponseSuccessByAlert((prev) => ({ ...prev, [alertKey]: responseData?.message || successMessage }));
    } catch (error) {
      console.log("[alerts] Failed to submit guardian response", error);
      setGuardianResponseErrorByAlert((prev) => ({
        ...prev,
        [alertKey]: error?.response?.data?.detail || error?.response?.data?.message || "Unable to update your response right now.",
      }));
    } finally {
      setGuardianResponseLoadingByAlert((prev) => ({ ...prev, [alertKey]: false }));
    }
  }, [guardianResponseStateByAlert]);

  const handleOpenMapLocation = useCallback(async (alert, mode = "view") => {
    try {
      if (mode === "navigate") {
        await navigateToSosLocation(alert);
      } else {
        await openSosLocation(alert);
      }
    } catch (error) {
      console.log("[alerts] Failed to open location", error);
      Alert.alert("Unable to open location", "The alert location could not be opened right now.");
    }
  }, []);

  const handleOpenEmergencyChat = useCallback((alert) => {
    const alertId = getAlertIdentifier(alert);
    if (!alertId) {
      Alert.alert("Unable to open chat", "This incident does not have a valid id.");
      return;
    }

    router.push({ pathname: "/(app)/emergency-chat", params: { incident_id: alertId } });
  }, [router]);

  const handleOpenIncidentUpdates = useCallback((alert) => {
    const alertId = getAlertIdentifier(alert);
    if (!alertId) {
      Alert.alert("Unable to open incident updates", "This incident does not have a valid id.");
      return;
    }

    router.push({ pathname: "/incident-updates", params: { incident_id: alertId } });
  }, [router]);

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
                const alertId = String(getAlertIdentifier(alert) || "");
                const canViewAlertUpdates = Boolean(alertId);
                const closedAlert = isClosedAlert(alert);
                const closureSummaryFields = [
                  { label: "Closure notes", value: alert?.closure_notes },
                  { label: "Resolution summary", value: alert?.resolution_summary },
                  { label: "Actions taken", value: alert?.actions_taken },
                  { label: "Additional remarks", value: alert?.additional_remarks },
                ].filter((field) => Boolean(String(field.value || "").trim()));

                console.log("[alerts] render alert", {
                  role,
                  alertId,
                  canViewAlertUpdates,
                  isAdmin,
                  isSecurity,
                  isVolunteer,
                  isResident,
                  isAlertOwnedByUser: isAlertOwnedByUser(alert, user),
                  isAlertAssignedToUser: isAlertAssignedToUser(alert, user),
                  shouldRenderIncidentUpdates: canViewAlertUpdates,
                  assignedVolunteer: alert?.assigned_volunteer_id ?? alert?.assigned_volunteer,
                  status: alert?.status,
                  current_status: alert?.current_status,
                });

                return (
                  <View key={alertId || `${alert.message}-${alert.created_at}`} style={styles.alertCard}>
                    <View style={styles.alertHeaderRow}>
                      <View style={styles.badgeRow}>
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryBadgeText}>{getCategoryDisplayName(getAlertCategoryValue(alert), categories)}</Text>
                        </View>
                        <StatusBadge label={String(alert.status || "OPEN").toUpperCase()} tone={getStatusTone(alert.status)} compact />
                      </View>
                    </View>

                    <Text style={styles.alertMessage}>{alert.message || "Emergency alert"}</Text>
                    {expandedAlertId === alertId ? (
                      <View style={styles.alertDetailPanel}>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>SOS Status</Text>
                          <Text style={styles.detailValue}>{String(getSosStatusLabel(alert.status) || alert.status || "Unknown")}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Current status</Text>
                          <Text style={styles.detailValue}>{String(getSosStatusLabel(alert.current_status || alert.status) || alert.current_status || alert.status || "Unknown")}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Resident</Text>
                          <Text style={styles.detailValue}>{getAlertUserLabel(alert)}</Text>
                        </View>
                        {getAlertResidentPhone(alert) ? (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Resident phone</Text>
                            <Text style={styles.detailValue}>{getAlertResidentPhone(alert)}</Text>
                          </View>
                        ) : null}
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Location</Text>
                          <Text style={styles.detailValue}>{getIncidentLocationDetail(alert) || "Location unavailable"}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>SOS type</Text>
                          <Text style={styles.detailValue}>{getCategoryDisplayName(getAlertCategoryValue(alert), categories)}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Time created</Text>
                          <Text style={styles.detailValue}>{formatAlertTime(alert.created_at)}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Assigned volunteer</Text>
                          <Text style={styles.detailValue}>{getAssignedVolunteerLabel(alert, user)}</Text>
                        </View>
                        {closedAlert && closureSummaryFields.length > 0 ? (
                          <View style={styles.closureSummarySection}>
                            <Text style={styles.closureSummaryTitle}>Incident Closure Summary</Text>
                            {closureSummaryFields.map((field) => (
                              <View key={field.label} style={styles.closureSummaryRow}>
                                <Text style={styles.closureSummaryLabel}>{field.label}</Text>
                                <Text style={styles.closureSummaryValue}>{field.value}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    {isSecurity || isAdmin ? (
                      <View style={styles.userMetaWrap}>
                        <Text style={styles.metaText}>Resident: {getAlertUserLabel(alert)}</Text>
                        {alert.location ? <Text style={styles.metaText}>Location: {alert.location}</Text> : null}
                      </View>
                    ) : null}
                    <Text style={styles.metaText}>{formatAlertTime(alert.created_at)}</Text>
                    {alert.location && !(isSecurity || isAdmin) ? <Text style={styles.metaText}>{alert.location}</Text> : null}
                    {isGuardian ? (
                      <View style={styles.guardianSection}>
                        <View style={styles.guardianHeaderRow}>
                          <Text style={styles.guardianTitle}>Guardian response</Text>
                          <Text style={styles.guardianHint}>Reply to the resident request.</Text>
                        </View>

                        <Text style={styles.metaText}>Resident: {getAlertUserLabel(alert)}</Text>
                        {alert.location ? <Text style={styles.metaText}>Location: {alert.location}</Text> : null}

                        <View style={styles.actionRow}>
                          <AppButton
                            title={guardianResponseLoadingByAlert[String(alert.id)] ? "Working..." : guardianResponseStateByAlert[String(alert.id)]?.status === "accepted" ? "Accepted" : "Accept / I'm on my way"}
                            onPress={() => void handleGuardianRespond(alert, "accept")}
                            variant="primary"
                            style={styles.actionButton}
                            loading={guardianResponseLoadingByAlert[String(alert.id)]}
                            disabled={Boolean(guardianResponseStateByAlert[String(alert.id)]?.status)}
                          />
                          <AppButton
                            title={guardianResponseLoadingByAlert[String(alert.id)] ? "Working..." : guardianResponseStateByAlert[String(alert.id)]?.status === "declined" ? "Declined" : "Cannot respond"}
                            onPress={() => void handleGuardianRespond(alert, "decline")}
                            variant="secondary"
                            style={styles.actionButton}
                            loading={guardianResponseLoadingByAlert[String(alert.id)]}
                            disabled={Boolean(guardianResponseStateByAlert[String(alert.id)]?.status)}
                          />
                        </View>

                        <View style={styles.actionRow}>
                          <AppButton
                            title="View location"
                            onPress={() => void handleOpenMapLocation(alert, "view")}
                            variant="secondary"
                            style={styles.actionButton}
                          />
                          <AppButton
                            title="Navigate"
                            onPress={() => void handleOpenMapLocation(alert, "navigate")}
                            variant="secondary"
                            style={styles.actionButton}
                          />
                        </View>

                        {guardianResponseErrorByAlert[String(alert.id)] ? <Text style={styles.messageError}>{guardianResponseErrorByAlert[String(alert.id)]}</Text> : null}
                        {guardianResponseSuccessByAlert[String(alert.id)] ? <Text style={styles.successText}>{guardianResponseSuccessByAlert[String(alert.id)]}</Text> : null}
                      </View>
                    ) : null}

                    {isAdmin ? (
                      <>
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
                            title={broadcastingAlertId === String(getAlertIdentifier(alert)) ? "Broadcasting..." : "Broadcast"}
                            onPress={() => void handleBroadcastAlert(alert)}
                            variant="secondary"
                            style={styles.actionButton}
                            loading={broadcastingAlertId === String(getAlertIdentifier(alert))}
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

                        {String(alert.status || "").toUpperCase() === "RESOLVED" ? (
                          <View style={styles.updateForm}>
                            <Text style={styles.fieldLabel}>Closure notes</Text>
                            <TextInput
                              style={styles.messageInput}
                              placeholder="Add closure notes"
                              placeholderTextColor={appColors.muted}
                              value={closureNotesByAlert[String(alert.id)] ?? alert.closure_notes ?? ""}
                              onChangeText={(value) => setClosureNotesByAlert((prev) => ({ ...prev, [String(alert.id)]: value.slice(0, 500) }))}
                              multiline
                              maxLength={500}
                            />

                            <Text style={styles.fieldLabel}>Resolution summary</Text>
                            <TextInput
                              style={styles.messageInput}
                              placeholder="Summarize how the incident was resolved"
                              placeholderTextColor={appColors.muted}
                              value={resolutionSummaryByAlert[String(alert.id)] ?? alert.resolution_summary ?? ""}
                              onChangeText={(value) => setResolutionSummaryByAlert((prev) => ({ ...prev, [String(alert.id)]: value.slice(0, 500) }))}
                              multiline
                              maxLength={500}
                            />

                            <Text style={styles.fieldLabel}>Actions taken</Text>
                            <TextInput
                              style={styles.messageInput}
                              placeholder="Document actions taken to close the incident"
                              placeholderTextColor={appColors.muted}
                              value={actionsTakenByAlert[String(alert.id)] ?? alert.actions_taken ?? ""}
                              onChangeText={(value) => setActionsTakenByAlert((prev) => ({ ...prev, [String(alert.id)]: value.slice(0, 500) }))}
                              multiline
                              maxLength={500}
                            />

                            <Text style={styles.fieldLabel}>Additional remarks</Text>
                            <TextInput
                              style={styles.messageInput}
                              placeholder="Any additional remarks"
                              placeholderTextColor={appColors.muted}
                              value={additionalRemarksByAlert[String(alert.id)] ?? alert.additional_remarks ?? ""}
                              onChangeText={(value) => setAdditionalRemarksByAlert((prev) => ({ ...prev, [String(alert.id)]: value.slice(0, 500) }))}
                              multiline
                              maxLength={500}
                            />

                            <AppButton
                              title={closureLoadingByAlert[String(alert.id)] ? "Closing..." : "Close Incident"}
                              onPress={() => void handleCloseIncident(alert)}
                              variant="primary"
                              style={styles.sendButton}
                              loading={closureLoadingByAlert[String(alert.id)]}
                            />

                            {closureSuccessByAlert[String(alert.id)] ? <Text style={styles.successText}>{closureSuccessByAlert[String(alert.id)]}</Text> : null}
                            {closureErrorsByAlert[String(alert.id)] ? <Text style={styles.messageError}>{closureErrorsByAlert[String(alert.id)]}</Text> : null}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                    {canViewAlertUpdates ? (
                      <>
                        <View style={styles.updateSection}>
                          <View style={styles.updateHeaderRow}>
                            <Pressable style={styles.updateToggle} onPress={() => void handleToggleAlertMessages(alert)}>
                              <Text style={styles.updateTitle}>Incident Updates</Text>
                              <Text style={styles.updateHint}>{expandedAlertId === alertId ? "Hide" : "Show"}</Text>
                            </Pressable>
                            <AppButton title="Open Chat" variant="secondary" style={styles.chatButton} onPress={() => handleOpenEmergencyChat(alert)} />
                            <AppButton title="Incident Updates" variant="secondary" style={styles.chatButton} onPress={() => handleOpenIncidentUpdates(alert)} />
                          </View>

                          {expandedAlertId === alertId ? (
                            <View style={styles.updateContent}>
                              {messageLoadingByAlert[alertId] ? (
                                <Text style={styles.emptyText}>Loading updates...</Text>
                              ) : (messagesByAlert[alertId] || []).length === 0 ? (
                                <Text style={styles.emptyText}>No incident updates yet.</Text>
                              ) : (
                                <View style={styles.messageList}>
                                  {sortMessagesForDisplay(messagesByAlert[alertId] || []).map((message) => (
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
                                              <AppButton title="Retry transcription" onPress={() => void handleRetryTranscription(alert)} variant="secondary" style={styles.actionButton} loading={transcriptionLoadingByAlert[alertId]} />
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
                                      Lat: {Number.isFinite(incidentCoordinatesByAlert[alertId]?.latitude ?? alert.latitude) ? String(incidentCoordinatesByAlert[alertId]?.latitude ?? alert.latitude) : "—"} • Lon: {Number.isFinite(incidentCoordinatesByAlert[alertId]?.longitude ?? alert.longitude) ? String(incidentCoordinatesByAlert[alertId]?.longitude ?? alert.longitude) : "—"}
                                    </Text>
                                  </View>

                                  <View style={styles.actionRow}>
                                    <AppButton
                                      title={locationLoadingByAlert[alertId] ? "Refreshing..." : "Refresh Location"}
                                      onPress={() => void handleRefreshLocation(alert)}
                                      variant="secondary"
                                      style={styles.actionButton}
                                      loading={locationLoadingByAlert[alertId]}
                                    />
                                  </View>

                                  <Text style={styles.fieldLabel}>Add message</Text>
                                  <TextInput
                                    style={styles.messageInput}
                                    placeholder="Add an update for the incident timeline"
                                    placeholderTextColor={appColors.muted}
                                    value={messageDraftsByAlert[alertId] ?? ""}
                                    onChangeText={(value) => setMessageDraftsByAlert((prev) => ({ ...prev, [alertId]: value.slice(0, 500) }))}
                                    multiline
                                    maxLength={500}
                                  />
                                  <AppButton
                                    title={messagePostingByAlert[alertId] ? "Posting..." : "Add Message"}
                                    onPress={() => void handlePostMessage(alert)}
                                    variant="secondary"
                                    style={styles.sendButton}
                                    loading={messagePostingByAlert[alertId]}
                                  />

                                  <Text style={styles.fieldLabel}>Emergency Description</Text>
                                  <TextInput
                                    style={styles.messageInput}
                                    placeholder="Describe the incident"
                                    placeholderTextColor={appColors.muted}
                                    value={incidentDrafts[alertId] ?? alert.message ?? ""}
                                    onChangeText={(value) => setIncidentDrafts((prev) => ({ ...prev, [alertId]: value.slice(0, 500) }))}
                                    multiline
                                    maxLength={500}
                                  />

                                  <AppButton
                                    title={incidentUpdatingByAlert[alertId] ? "Updating..." : "Update Incident"}
                                    onPress={() => void handleUpdateIncident(alert)}
                                    variant="primary"
                                    style={styles.sendButton}
                                    loading={incidentUpdatingByAlert[alertId]}
                                  />
                                </View>
                              ) : null}

                              {messageSuccessByAlert[alertId] ? <Text style={styles.successText}>{messageSuccessByAlert[alertId]}</Text> : null}
                              {incidentSuccessByAlert[alertId] ? <Text style={styles.successText}>{incidentSuccessByAlert[alertId]}</Text> : null}
                              {messageErrorsByAlert[alertId] ? <Text style={styles.messageError}>{messageErrorsByAlert[alertId]}</Text> : null}
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
  guardianSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: appColors.border, paddingTop: 10 },
  guardianHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  guardianTitle: { color: appColors.navy, fontSize: 13, fontWeight: "700" },
  guardianHint: { color: appColors.blue, fontSize: 11, fontWeight: "700" },
  updateSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: appColors.border, paddingTop: 10 },
  updateHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 },
  updateToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flex: 1 },
  chatButton: { minWidth: 88 },
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
  closureSummarySection: { marginTop: 10, borderWidth: 1, borderColor: appColors.border, borderRadius: 10, padding: 10, backgroundColor: appColors.white },
  closureSummaryTitle: { color: appColors.navy, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  closureSummaryRow: { marginTop: 8 },
  closureSummaryLabel: { color: appColors.slate, fontSize: 12, fontWeight: "700" },
  closureSummaryValue: { color: appColors.navy, fontSize: 12, marginTop: 2, lineHeight: 18 },
});
