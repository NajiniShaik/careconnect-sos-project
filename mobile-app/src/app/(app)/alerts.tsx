import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, AppScreen, PageHeader, SectionCard, StatusBadge, appColors } from "../../components/common/designSystem";
import { getStoredUser } from "../../services/authService";
import { deleteSosAlert, fetchSosAlerts, fetchSosCategories, normalizeSosHistory, resolveSosAlert } from "../../services/sosService";

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

export default function AlertsRoute() {
  const [user, setUser] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

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

  const handleResolveAlert = async (alert) => {
    if (!alert?.id) {
      return;
    }

    Alert.alert("Resolve alert", "Are you sure you want to resolve this alert?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Resolve",
        onPress: async () => {
          setActionLoadingId(alert.id);
          try {
            await resolveSosAlert(alert.id, "RESOLVED");
            await loadAlerts(true);
          } catch (error) {
            console.log("[alerts] Failed to resolve alert", error);
            Alert.alert("Unable to resolve", "The alert could not be updated right now.");
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const handleDeleteAlert = async (alert) => {
    if (!alert?.id) {
      return;
    }

    Alert.alert("Delete alert", "This action cannot be undone. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        onPress: async () => {
          setActionLoadingId(alert.id);
          try {
            await deleteSosAlert(alert.id);
            setAlerts((prev) => prev.filter((item) => String(item.id) !== String(alert.id)));
            Alert.alert("Deleted", "The SOS alert was deleted.");
            await loadAlerts(true);
          } catch (error) {
            console.log("[alerts] Failed to delete alert", error);
            Alert.alert("Unable to delete", "The alert could not be deleted right now.");
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const handleResidentDeleteAlert = async (alert) => {
    if (!alert?.id) {
      return;
    }

    Alert.alert("Delete this SOS alert?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setActionLoadingId(alert.id);
          try {
            await deleteSosAlert(alert.id);
            setAlerts((prev) => prev.filter((item) => String(item.id) !== String(alert.id)));
            Alert.alert("Deleted", "The SOS alert was deleted.");
            await loadAlerts(true);
          } catch (error) {
            console.log("[alerts] Failed to delete resident alert", error);
            Alert.alert("Unable to delete", "The alert could not be deleted right now.");
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const visibleAlerts = useMemo(() => {
    if (!isResident) {
      return filteredAlerts;
    }

    return filteredAlerts.filter((alert) => isAlertOwnedByUser(alert, user));
  }, [filteredAlerts, isResident, user]);

  return (
    <AppScreen scrollable={false}>
      <View style={styles.screenContent}>
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
          <ScrollView
            style={styles.alertList}
            contentContainerStyle={styles.alertListContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void loadAlerts(true)} tintColor={appColors.blue} />
            }
            showsVerticalScrollIndicator={false}
          >
            {loading && !refreshing ? (
              <Text style={styles.emptyText}>Loading alerts...</Text>
            ) : visibleAlerts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No alerts available for this category.</Text>
                <Text style={styles.emptyDescription}>Try a different category or pull to refresh.</Text>
              </View>
            ) : (
              visibleAlerts.map((alert) => (
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
                        title={actionLoadingId === alert.id ? "Working..." : "Resolve"}
                        onPress={() => handleResolveAlert(alert)}
                        variant="secondary"
                        style={styles.actionButton}
                        loading={actionLoadingId === alert.id}
                      />
                      <AppButton
                        title={actionLoadingId === alert.id ? "Working..." : "Delete"}
                        onPress={() => handleDeleteAlert(alert)}
                        variant="danger"
                        style={styles.actionButton}
                        loading={actionLoadingId === alert.id}
                      />
                    </View>
                  ) : null}
                  {isResident && isAlertOwnedByUser(alert, user) ? (
                    <View style={styles.actionRow}>
                      <AppButton
                        title={actionLoadingId === alert.id ? "Working..." : "Delete"}
                        onPress={() => handleResidentDeleteAlert(alert)}
                        variant="danger"
                        style={styles.actionButton}
                        loading={actionLoadingId === alert.id}
                      />
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
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
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flex: 1 },
  cardSpacing: { marginBottom: 14 },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 4 },
  categoryChip: { borderWidth: 1, borderColor: appColors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, backgroundColor: appColors.white },
  categoryChipActive: { borderColor: appColors.blue, backgroundColor: appColors.blueSoft },
  categoryChipText: { color: appColors.slate, fontSize: 13, fontWeight: "700" },
  categoryChipTextActive: { color: appColors.blue },
  alertList: { maxHeight: 320 },
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
  emptyState: { paddingVertical: 16, alignItems: "center" },
  emptyTitle: { color: appColors.navy, fontSize: 15, fontWeight: "700" },
  emptyDescription: { color: appColors.slate, marginTop: 6, textAlign: "center" },
  emptyText: { color: appColors.slate, paddingVertical: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: appColors.border },
  detailLabel: { color: appColors.slate },
  detailValue: { color: appColors.navy, fontWeight: "700" },
});
