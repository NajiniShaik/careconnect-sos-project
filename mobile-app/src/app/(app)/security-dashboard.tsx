import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppButton, AppIcon, AppScreen, EmptyState, PageHeader, SectionCard, appColors } from "../../components/common/designSystem";
import { getStoredUser, clearAuth, getErrorMessage } from "../../services/authService";
import { fetchSecurityDashboardData } from "../../services/sosService";

function formatMetricValue(value) {
  return typeof value === "number" ? String(value) : "-";
}

function formatRelativeTime(value) {
  if (!value) return "Recently updated";
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return "Recently updated";
  const diffSeconds = Math.floor((Date.now() - dateValue.getTime()) / 1000);
  if (diffSeconds < 60) return "Just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function getStatusTone(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "RESOLVED" || normalized === "CLOSED") return "success";
  if (normalized === "ESCALATED" || normalized === "OPEN" || normalized === "PENDING") return "warning";
  return "neutral";
}

function getPriorityTone(priority) {
  const normalized = String(priority || "").toUpperCase();
  if (normalized === "HIGH" || normalized === "CRITICAL") return "danger";
  if (normalized === "MEDIUM") return "warning";
  return "neutral";
}

export default function SecurityDashboardRoute() {
  const router = useRouter();
  const [summary, setSummary] = useState(null);
  const [user, setUser] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [activeIncidents, setActiveIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState(null);

  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const dashboardResponse = await fetchSecurityDashboardData();
      const dashboardData = dashboardResponse?.data || null;
      const summaryData = dashboardData?.summary || null;
      const recentActivityData = Array.isArray(dashboardData?.recent_activity) ? dashboardData.recent_activity : [];
      const activeIncidentData = Array.isArray(dashboardData?.active_incidents) ? dashboardData.active_incidents : [];

      const normalizedSummary = summaryData
        ? {
            ...summaryData,
            active_incidents: Number(summaryData.active_incidents ?? 0),
            escalated_incidents: Number(summaryData.escalated_incidents ?? 0),
            resolved_incidents: Number(summaryData.resolved_incidents ?? 0),
            total_incidents: Number(summaryData.total_incidents ?? 0),
            active_societies: Number(summaryData.active_societies ?? 0),
          }
        : null;

      const normalizedActiveIncidents = activeIncidentData.slice(0, 5).map((item) => ({
        id: item?.id || "",
        title: item?.title || item?.message || "Security alert",
        priority: item?.priority || "Medium",
        status: String(item?.status || "ACTIVE").toUpperCase(),
        society: item?.society || "Unknown society",
        time: item?.created_at || null,
      }));

      const normalizedActivity = recentActivityData.slice(0, 5).map((item) => ({
        id: item?.id || `${item?.type || "activity"}-${item?.created_at || Date.now()}`,
        title: item?.title || item?.description || "Incident update",
        status: item?.status || "Active",
        time: item?.created_at || null,
        description: item?.description || item?.message || "",
      }));

      setSummary(normalizedSummary);
      setActiveIncidents(normalizedActiveIncidents);
      setRecentActivity(normalizedActivity);
    } catch (loadError) {
      const status = loadError?.response?.status;
      // If auth expired or unauthorized, clear auth and navigate to login
      if (status === 401 || status === 403) {
        try {
          await clearAuth();
        } catch (e) {}
        router.replace('/');
        return;
      }

      const detail = getErrorMessage(loadError) || "Unable to load dashboard summary.";
      setError(detail);
      setSummary(null);
      setActiveIncidents([]);
      setRecentActivity([]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const currentUser = await getStoredUser();
        if (!mounted) return;
        const nextRole = String(currentUser?.role || "").toUpperCase() || null;
        setUser(currentUser);
        setUserRole(nextRole);
      } catch {
        if (!mounted) return;
        setUser(null);
        setUserRole(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      await loadDashboardData(false);
      if (!active) return;
    };
    void init();
    return () => {
      active = false;
    };
  }, [loadDashboardData]);

  const handleRefresh = useCallback(() => {
    void loadDashboardData(true);
  }, [loadDashboardData]);

  const profileName = useMemo(() => {
    if (user?.name) return user.name;
    if (user?.username) return user.username;
    return "Operator";
  }, [user]);

  const roleLabel = useMemo(() => {
    if (userRole === "ADMIN") return "Admin";
    if (userRole === "SECURITY") return "Security";
    return "Operations";
  }, [userRole]);

  if (userRole && userRole !== "SECURITY" && userRole !== "ADMIN") {
    return (
      <AppScreen>
        <View style={styles.centered}>
          <Text style={styles.accessDeniedTitle}>Access denied</Text>
          <Text style={styles.accessDeniedText}>This dashboard is available to security staff only.</Text>
          <AppButton title="Go back" onPress={() => router.push("/dashboard")} variant="secondary" />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={appColors.blue} />}
      >
        <PageHeader
          eyebrow="Security operations"
          title="Security dashboard"
        />

        <View style={styles.heroCard}>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroEyebrow}>Welcome back</Text>
            <Text style={styles.heroName}>{profileName}</Text>
            <Text style={styles.heroRole}>{roleLabel} • Active monitoring</Text>
          </View>
          <View style={styles.heroStatusBadge}>
            <Text style={styles.heroStatusText}>On duty</Text>
          </View>
        </View>

        <SectionCard title="Operations snapshot" icon="analytics-outline">
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={appColors.blue} />
              <Text style={styles.loadingText}>Loading operations view…</Text>
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : summary ? (
            <View style={styles.metricGrid}>
              <View style={[styles.metricCard, styles.metricCardNeutral]}>
                <View style={styles.metricIconWrap}>
                  <AppIcon name="stats-chart-outline" size={18} color={appColors.white} />
                </View>
                <Text style={styles.metricLabel}>Total</Text>
                <Text style={styles.metricValue}>{formatMetricValue(summary.total_incidents)}</Text>
              </View>
              <View style={[styles.metricCard, styles.metricCardPrimary]}>
                <View style={styles.metricIconWrap}>
                  <AppIcon name="warning-outline" size={18} color={appColors.white} />
                </View>
                <Text style={styles.metricLabel}>Active</Text>
                <Text style={styles.metricValue}>{formatMetricValue(summary.active_incidents)}</Text>
              </View>
              <View style={[styles.metricCard, styles.metricCardWarning]}>
                <View style={styles.metricIconWrap}>
                  <AppIcon name="alert-circle-outline" size={18} color={appColors.white} />
                </View>
                <Text style={styles.metricLabel}>Escalated</Text>
                <Text style={styles.metricValue}>{formatMetricValue(summary.escalated_incidents)}</Text>
              </View>
              <View style={[styles.metricCard, styles.metricCardInfo]}>
                <View style={styles.metricIconWrap}>
                  <AppIcon name="checkmark-circle-outline" size={18} color={appColors.white} />
                </View>
                <Text style={styles.metricLabel}>Resolved</Text>
                <Text style={styles.metricValue}>{formatMetricValue(summary.resolved_incidents)}</Text>
              </View>
              <View style={[styles.metricCard, styles.metricCardNeutral]}>
                <View style={styles.metricIconWrap}>
                  <AppIcon name="home-outline" size={18} color={appColors.white} />
                </View>
                <Text style={styles.metricLabel}>Active societies</Text>
                <Text style={styles.metricValue}>{formatMetricValue(summary.active_societies)}</Text>
              </View>
            </View>
          ) : (
            <EmptyState title="No incident data available" message="There are no dashboard metrics to display right now." icon="shield-outline" />
          )}
        </SectionCard>

        <SectionCard title="Quick actions" icon="flash-outline">
          <View style={styles.actionGrid}>
            <Pressable style={styles.actionCard} onPress={() => router.push("/alerts")}>
              <AppIcon name="warning-outline" size={20} color={appColors.blue} />
              <Text style={styles.actionTitle}>Alerts</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => router.push("/volunteer-incidents")}>
              <AppIcon name="people-outline" size={20} color={appColors.blue} />
              <Text style={styles.actionTitle}>Community incidents</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => router.push("/security-reporting?returnTo=%2Fsecurity-dashboard")}>
              <AppIcon name="stats-chart-outline" size={20} color={appColors.blue} />
              <Text style={styles.actionTitle}>Reporting summary</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => router.push("/alerts")}>
              <AppIcon name="chatbubble-outline" size={20} color={appColors.blue} />
              <Text style={styles.actionTitle}>Incident updates</Text>
            </Pressable>
          </View>
        </SectionCard>

        <SectionCard title="Recent incident activity" icon="time-outline">
          {recentActivity.length > 0 ? (
            recentActivity.map((item) => (
              <View key={item.id} style={styles.activityItem}>
                <View style={styles.activityHeaderRow}>
                  <Text style={styles.activityTitle}>{item.title}</Text>
                  <Text style={styles.activityTime}>{formatRelativeTime(item.time)}</Text>
                </View>
                {item.description ? <Text style={styles.activityDescription}>{item.description}</Text> : null}
                <Text style={styles.activityStatus}>{item.status}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No recent activity is available right now.</Text>
          )}
        </SectionCard>

        <SectionCard title="Latest active incidents" icon="list-outline">
          {activeIncidents.length > 0 ? (
            activeIncidents.map((incident) => (
              <View key={incident.id} style={styles.incidentRow}>
                <View style={styles.incidentContent}>
                  <View style={styles.incidentHeaderRow}>
                    <Text style={styles.incidentTitle}>{incident.title}</Text>
                    <View style={[styles.badge, getPriorityTone(incident.priority) === "danger" ? styles.badgeDanger : styles.badgeNeutral]}>
                      <Text style={styles.badgeText}>{incident.priority}</Text>
                    </View>
                  </View>
                  <View style={styles.incidentMetaRow}>
                    <View style={[styles.statusPill, getStatusTone(incident.status) === "warning" ? styles.statusWarning : styles.statusNeutral]}>
                      <Text style={styles.statusPillText}>{incident.status}</Text>
                    </View>
                    <Text style={styles.incidentMeta}>{incident.society}</Text>
                  </View>
                  <Text style={styles.incidentTime}>{formatRelativeTime(incident.time)}</Text>
                </View>
                <View style={styles.incidentActions}>
                  <AppButton
                    title="Coordinate"
                    onPress={() => router.push(`/security-coordination?incidentId=${encodeURIComponent(String(incident.id))}&returnTo=%2Fsecurity-dashboard`)}
                    variant="secondary"
                    style={styles.viewButton}
                  />
                  <AppButton
                    title="Updates"
                    onPress={() => router.push(`/security-updates?incidentId=${encodeURIComponent(String(incident.id))}&returnTo=%2Fsecurity-dashboard`)}
                    style={styles.viewButton}
                  />
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>There are no active incidents to display right now.</Text>
          )}
        </SectionCard>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  accessDeniedTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: appColors.slate,
    marginBottom: 12,
  },
  accessDeniedText: {
    fontSize: 16,
    color: appColors.slateDark,
    marginBottom: 20,
    textAlign: "center",
  },
  heroCard: {
    backgroundColor: appColors.navy,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroTextWrap: { flex: 1 },
  heroEyebrow: {
    color: appColors.white,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    opacity: 0.8,
  },
  heroName: {
    color: appColors.white,
    fontSize: 20,
    fontWeight: "800",
  },
  heroRole: {
    color: appColors.white,
    fontSize: 13,
    marginTop: 2,
    opacity: 0.85,
  },
  heroStatusBadge: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  heroStatusText: {
    color: appColors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: appColors.slate,
  },
  errorText: {
    color: appColors.danger,
    marginTop: 12,
    fontSize: 14,
  },
  statusCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusBullet: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: appColors.blue,
  },
  statusCopy: { flex: 1 },
  statusTitle: {
    color: appColors.navy,
    fontSize: 16,
    fontWeight: "700",
  },
  statusText: {
    color: appColors.slate,
    marginTop: 4,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flexBasis: "48%",
    minWidth: 140,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: appColors.white,
  },
  metricCardPrimary: { backgroundColor: "#eff6ff" },
  metricCardWarning: { backgroundColor: "#fff7ed" },
  metricCardInfo: { backgroundColor: "#f0fdf4" },
  metricCardNeutral: { backgroundColor: "#f8fafc" },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: appColors.blue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  metricLabel: {
    fontSize: 12,
    color: appColors.muted,
    marginBottom: 4,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: appColors.navy,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionCard: {
    flexBasis: "31%",
    minWidth: 100,
    backgroundColor: appColors.mist,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: appColors.border,
    padding: 12,
  },
  actionTitle: {
    color: appColors.navy,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
  },
  actionSubtitle: {
    color: appColors.slate,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  activityItem: {
    backgroundColor: appColors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: appColors.border,
    padding: 12,
    marginTop: 10,
  },
  activityHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  activityTitle: {
    color: appColors.navy,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  activityTime: {
    color: appColors.muted,
    fontSize: 12,
  },
  activityDescription: {
    color: appColors.slate,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  activityStatus: {
    color: appColors.blue,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    textTransform: "uppercase",
  },
  incidentRow: {
    backgroundColor: appColors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: appColors.border,
    padding: 12,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  incidentActions: {
    gap: 8,
    minWidth: 104,
  },
  incidentContent: {
    flex: 1,
  },
  incidentHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  incidentTitle: {
    color: appColors.navy,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  incidentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    flexWrap: "wrap",
    gap: 8,
  },
  incidentMeta: {
    color: appColors.slate,
    fontSize: 12,
  },
  incidentTime: {
    color: appColors.muted,
    fontSize: 12,
    marginTop: 6,
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  badgeDanger: {
    backgroundColor: "#fee2e2",
  },
  badgeNeutral: {
    backgroundColor: appColors.mist,
  },
  badgeText: {
    color: appColors.navy,
    fontSize: 11,
    fontWeight: "700",
  },
  statusPill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  statusWarning: {
    backgroundColor: "#fff7ed",
  },
  statusNeutral: {
    backgroundColor: appColors.mist,
  },
  statusPillText: {
    color: appColors.navy,
    fontSize: 11,
    fontWeight: "700",
  },
  viewButton: {
    minWidth: 70,
  },
  emptyText: {
    color: appColors.slate,
    marginTop: 8,
    fontSize: 14,
  },
});