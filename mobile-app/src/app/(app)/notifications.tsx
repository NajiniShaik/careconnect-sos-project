// @ts-nocheck
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, VirtualizedList, RefreshControl, Pressable, Modal, Alert, Platform } from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";
import { AppScreen, PageHeader, AppButton, appColors, AppIcon } from "../../components/common/designSystem";
import { getStoredUser } from "../../services/authService";
import {
  fetchNotificationsFromBackend,
  subscribeToNotificationUpdates,
  getNotificationPermissionStatus,
  markAllRead,
  requestNotificationPermission,
  deleteNotification,
} from "../../services/notificationService";

const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "sos", label: "SOS Alerts" },
  { key: "system", label: "System" },
];

const ICONS = {
  sos: { name: "warning-outline", color: appColors.red },
  system: { name: "shield-outline", color: appColors.amber },
  general: { name: "sparkles-outline", color: appColors.blue },
};

function getNotificationType(item) {
  const kind = String(item?.kind || item?.data?.type || "").toUpperCase();
  const type = String(item?.data?.type || "").toUpperCase();
  if (["SOS", "EMERGENCY"].includes(kind) || ["SOS", "EMERGENCY"].includes(type)) {
    return "sos";
  }
  if (["ANNOUNCEMENT", "ANNOUNCEMENTS", "GENERAL", "INFO", "SOCIETY_UPDATE", "SOCIETY", "UPDATE"].includes(kind) || ["ANNOUNCEMENT", "GENERAL", "INFO", "SOCIETY_UPDATE", "SOCIETY", "UPDATE"].includes(type)) {
    return "system";
  }
  return "general";
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  const delta = Math.floor((Date.now() - date.getTime()) / 1000);
  if (delta < 60) return `${delta} sec ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} hr ago`;
  return date.toLocaleDateString();
}

export default function NotificationsRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [permissionFlowStep, setPermissionFlowStep] = useState("request");
  const listRef = useRef(null);

  const load = useCallback(async () => {
    const list = await fetchNotificationsFromBackend();
    setItems(Array.isArray(list) ? list : []);
  }, []);

  const selectedNotificationId = params?.selectedId ? String(params.selectedId) : null;

  useEffect(() => {
    if (!selectedNotificationId || !listRef.current || items.length === 0) return;
    const index = items.findIndex((item) => String(item?.id) === String(selectedNotificationId));
    if (index < 0) return;
    setTimeout(() => {
      try {
        listRef.current?.scrollToIndex?.({ index, animated: true });
      } catch {
        // ignore scroll errors
      }
    }, 80);
  }, [selectedNotificationId, items]);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeToNotificationUpdates(() => {
      if (mounted) {
        void load();
      }
    });

    (async () => {
      if (!mounted) return;
      const currentUser = await getStoredUser();
      if (mounted) {
        setUserRole(currentUser?.role || null);
      }
      const status = await getNotificationPermissionStatus();
      setPermissionFlowStep("request");
      if (status !== "granted" && status !== "denied" && status !== "expo_go") {
        setShowPermissionModal(true);
      }
      await load();
    })();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const unreadCount = items.filter((i) => !i.read).length;
  const isVolunteer = String(userRole || "").toUpperCase() === "VOLUNTEER";

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") return items;
    return items.filter((item) => getNotificationType(item) === activeFilter);
  }, [items, activeFilter]);

  const handleMarkAll = async () => {
    const next = await markAllRead();
    setItems(next);
  };

  const handleAllowNotifications = async () => {
    const result = await requestNotificationPermission();
    if (result?.status === "granted") {
      setPermissionFlowStep("success");
      setShowPermissionModal(true);
    } else {
      setShowPermissionModal(false);
      setPermissionFlowStep("request");
    }
  };

  const renderFilterPill = (option) => (
    <Pressable
      key={option.key}
      onPress={() => setActiveFilter(option.key)}
      style={[
        styles.filterPill,
        activeFilter === option.key ? styles.filterPillActive : styles.filterPillInactive,
      ]}
    >
      <Text style={[styles.filterLabel, activeFilter === option.key ? styles.filterLabelActive : null]}>{option.label}</Text>
    </Pressable>
  );

  const handleDelete = async (id) => {
    const confirmed = await new Promise((resolve) => {
      if (Platform.OS === "web" && typeof globalThis.window !== "undefined" && typeof window.confirm === "function") {
        resolve(window.confirm("Delete this notification?"));
        return;
      }

      Alert.alert("Delete notification", "Are you sure you want to delete this notification?", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Delete", style: "destructive", onPress: () => resolve(true) },
      ]);
    });

    if (!confirmed) return;

    const next = await deleteNotification(id);
    setItems(Array.isArray(next) ? next : []);
  };

  const renderNotificationCard = (item) => {
    const type = getNotificationType(item);
    const icon = ICONS[type] || ICONS.general;
    const title = type === "sos" ? "Emergency SOS Alert" : "System Update";
    const subtitle = item.body || "No description available.";
    const isSelected = selectedNotificationId && String(item.id) === String(selectedNotificationId);

    return (
      <Pressable
        key={item.id}
        onPress={() => {
          if (item.data?.target) {
            router.push(item.data.target);
          } else if (item.data?.type === "COMMUNITY_BROADCAST" || item.data?.broadcast === true) {
            router.push("/volunteer-incidents");
          } else if (item.data?.type === "SECURITY_ALERT" || item.kind === "SECURITY_ALERT") {
            router.push(`/security-incidents?notificationId=${encodeURIComponent(String(item.id || ""))}`);
          }
        }}
        style={[styles.card, !item.read && styles.unreadCard, isSelected && styles.selectedCard]}
      >
        <View style={styles.cardHeaderRow}>
          <View style={[styles.iconDot, { backgroundColor: icon.color }]}>
            <AppIcon name={icon.name} size={18} color={appColors.white} />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardType}>{item.data?.type || item.kind || "System"}</Text>
          </View>
          <Text style={styles.cardTime}>{formatRelativeTime(item.received_at || item.created_at)}</Text>
        </View>
        <Text style={styles.cardBody}>{subtitle}</Text>
        <View style={styles.cardActions}>
          <Pressable onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
            <AppIcon name="trash-outline" size={16} color={appColors.red} />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const permissionModal = (
    <Modal visible={showPermissionModal} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {permissionFlowStep === "request" ? (
            <View style={styles.permissionCard}>
              <View style={styles.permissionBadge}>
                <AppIcon name="warning-outline" size={28} color={appColors.white} />
              </View>
              <Text style={styles.permissionHeading}>Stay Updated, Stay Safe</Text>
              <Text style={styles.permissionSubheading}>Allow notifications to receive important emergency alerts.</Text>
              <View style={styles.permissionList}>
                {[
                  "Instant Alerts",
                  "Important Updates",
                  "Stay Informed",
                ].map((item) => (
                  <View key={item} style={styles.permissionItem}>
                    <View style={styles.permissionDot} />
                    <Text style={styles.permissionItemText}>{item}</Text>
                  </View>
                ))}
              </View>
              <AppButton title="Allow Notifications" onPress={handleAllowNotifications} style={styles.primaryButton} />
              <AppButton title="Not Now" variant="secondary" onPress={() => {
                setShowPermissionModal(false);
                setPermissionFlowStep("request");
              }} style={styles.secondaryButton} />
            </View>
          ) : (
            <View style={[styles.permissionCard, styles.permissionSuccessCard]}>
              <View style={[styles.permissionBadge, styles.permissionBadgeSuccess]}>
                <AppIcon name="shield-checkmark-outline" size={28} color={appColors.white} />
              </View>
              <Text style={styles.permissionHeading}>You&apos;re All Set!</Text>
              <Text style={styles.permissionSubheading}>You will now receive important alerts.</Text>
              <AppButton title="Continue" onPress={() => setShowPermissionModal(false)} style={styles.primaryButton} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Notifications"
        title="Notification center"
        subtitle="Stay informed about alerts, announcements, and society updates."
        action={isVolunteer ? <AppButton title="Volunteer incidents" onPress={() => router.push("/volunteer-incidents")} variant="secondary" style={styles.inlineButton} /> : undefined}
      />

      <VirtualizedList
        ref={listRef}
        data={filteredItems}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        getItemCount={(data) => data.length}
        getItem={(data, index) => data[index]}
        keyExtractor={(item) => String(item.id || item.received_at || Math.random())}
        renderItem={({ item }) => renderNotificationCard(item)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={appColors.blue} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <View>
            <View style={styles.filterRow}>{FILTER_OPTIONS.map(renderFilterPill)}</View>
            <View style={styles.topBar}>
              <Text style={styles.summaryText}>{unreadCount} unread</Text>
              <View style={styles.topButtons}>
                <AppButton title="Mark all read" onPress={handleMarkAll} variant="secondary" />
                <AppButton title="Refresh" onPress={onRefresh} variant="ghost" />
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyMessage}>Your notification feed is empty right now. Pull to refresh.</Text>
          </View>
        )}
        ListFooterComponent={<View style={styles.listFooter} />}
      />

      {permissionModal}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 32 },
  listFooter: { height: 16 },
  inlineButton: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 8 },
  filterRow: { flexDirection: "row", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  filterPill: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1 },
  filterPillActive: { borderColor: appColors.blue, backgroundColor: appColors.blueSoft },
  filterPillInactive: { borderColor: appColors.border, backgroundColor: appColors.white },
  filterLabel: { fontSize: 13, fontWeight: "600", color: appColors.slate },
  filterLabelActive: { color: appColors.blue },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  summaryText: { color: appColors.slate, fontSize: 14, fontWeight: "600" },
  topButtons: { flexDirection: "row", gap: 10 },
  card: { borderRadius: 18, backgroundColor: appColors.white, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: appColors.border },
  unreadCard: { backgroundColor: appColors.blueSoft },
  selectedCard: { borderColor: appColors.blue, borderWidth: 2, backgroundColor: "rgba(59, 130, 246, 0.08)" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  iconDot: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  cardHeaderText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: appColors.navy },
  cardType: { marginTop: 4, fontSize: 13, color: appColors.muted },
  cardTime: { fontSize: 12, color: appColors.muted },
  cardBody: { fontSize: 14, lineHeight: 20, color: appColors.slate },
  cardActions: { marginTop: 12, alignItems: "flex-end" },
  deleteButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: appColors.redSoft || appColors.red, backgroundColor: appColors.redSoft || appColors.white },
  deleteButtonText: { color: appColors.red, fontSize: 13, fontWeight: "700" },
  emptyState: { marginTop: 48, padding: 24, borderRadius: 18, backgroundColor: appColors.white, borderWidth: 1, borderColor: appColors.border, alignItems: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: appColors.navy, marginBottom: 8 },
  emptyMessage: { fontSize: 14, color: appColors.slate, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.35)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContainer: { width: "100%", maxWidth: 520, gap: 16 },
  permissionCard: { backgroundColor: appColors.white, borderRadius: 22, padding: 24, borderWidth: 1, borderColor: appColors.border, shadowColor: appColors.shadow, shadowOpacity: 0.16, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  permissionSuccessCard: {},
  permissionBadge: { width: 56, height: 56, borderRadius: 18, justifyContent: "center", alignItems: "center", backgroundColor: appColors.blue, marginBottom: 18 },
  permissionBadgeSuccess: { backgroundColor: appColors.green },
  permissionHeading: { fontSize: 22, fontWeight: "800", color: appColors.navy, marginBottom: 10 },
  permissionSubheading: { color: appColors.slate, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  permissionList: { gap: 12, marginBottom: 20 },
  permissionItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  permissionDot: { width: 10, height: 10, borderRadius: 99, backgroundColor: appColors.blue },
  permissionItemText: { color: appColors.navy, fontSize: 14, fontWeight: "600" },
  primaryButton: { marginBottom: 10 },
  secondaryButton: {},
});
