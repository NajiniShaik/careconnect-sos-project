// @ts-nocheck
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppButton, AppScreen, EmptyState, PageHeader, SectionCard, appColors } from "../../components/common/designSystem";
import { clearAuth, getErrorMessage, getStoredUser } from "../../services/authService";
import { fetchSecurityReportingSummary } from "../../services/sosService";

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

function formatMetric(value) {
  return typeof value === "number" ? String(value) : "-";
}

export default function SecurityReportingRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
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
  const [summary, setSummary] = useState(null);
  const [society, setSociety] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetchSecurityReportingSummary();
      const data = response?.data || null;
      setSummary(data?.summary || null);
      setSociety(data?.society || null);
    } catch (loadError) {
      if (loadError?.response?.status === 401 || loadError?.response?.status === 403) {
        await clearAuth();
        router.replace("/");
        return;
      }
      setSummary(null);
      setSociety(null);
      setError(getErrorMessage(loadError) || "Unable to load the reporting summary.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

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
      void loadSummary();
    }, 0);
    return () => clearTimeout(timer);
  }, [authLoading, loadSummary, userRole]);

  if (authLoading) {
    return <AppScreen><View style={styles.centered}><ActivityIndicator size="large" color={appColors.blue} /></View></AppScreen>;
  }

  if (userRole !== "SECURITY") {
    return (
      <AppScreen>
        <EmptyState
          title="Access denied"
          message="Reporting is available to security staff only."
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
        title="Reporting summary"
        subtitle={society?.name ? `Incident totals for ${society.name}` : "Incident totals for your assigned society"}
        action={<AppButton title="Back" onPress={handleReturn} variant="secondary" />}
      />

      {loading ? (
        <SectionCard title="Loading report" icon="stats-chart-outline">
          <View style={styles.loadingRow}><ActivityIndicator color={appColors.blue} /><Text style={styles.loadingText}>Fetching current totals...</Text></View>
        </SectionCard>
      ) : error ? (
        <EmptyState title="Unable to load report" message={error} icon="stats-chart-outline" action={<AppButton title="Retry" onPress={() => void loadSummary()} />} />
      ) : !summary ? (
        <EmptyState title="No report data" message="No reporting summary is available for this society yet." icon="stats-chart-outline" action={<AppButton title="Refresh" onPress={() => void loadSummary(true)} variant="secondary" />} />
      ) : (
        <View>
          <SectionCard title="Incident totals" icon="stats-chart-outline">
            <View style={styles.metricGrid}>
              <View style={[styles.metricCard, styles.metricTotal]}><Text style={styles.metricLabel}>Total</Text><Text style={styles.metricValue}>{formatMetric(summary.total_incidents)}</Text></View>
              <View style={[styles.metricCard, styles.metricActive]}><Text style={styles.metricLabel}>Active</Text><Text style={styles.metricValue}>{formatMetric(summary.active_incidents)}</Text></View>
              <View style={[styles.metricCard, styles.metricEscalated]}><Text style={styles.metricLabel}>Escalated</Text><Text style={styles.metricValue}>{formatMetric(summary.escalated_incidents)}</Text></View>
              <View style={[styles.metricCard, styles.metricResolved]}><Text style={styles.metricLabel}>Resolved</Text><Text style={styles.metricValue}>{formatMetric(summary.resolved_incidents)}</Text></View>
            </View>
          </SectionCard>
          <AppButton title={refreshing ? "Refreshing..." : "Refresh report"} onPress={() => void loadSummary(true)} loading={refreshing} disabled={refreshing} variant="secondary" />
        </View>
      )}

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { color: appColors.slate, fontSize: 14 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { flexBasis: "48%", minWidth: 140, borderRadius: 14, borderWidth: 1, borderColor: appColors.border, padding: 16 },
  metricTotal: { backgroundColor: appColors.mist },
  metricActive: { backgroundColor: appColors.blueSoft },
  metricEscalated: { backgroundColor: appColors.amberSoft },
  metricResolved: { backgroundColor: appColors.greenSoft },
  metricLabel: { color: appColors.muted, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  metricValue: { color: appColors.navy, fontSize: 28, fontWeight: "800", marginTop: 8 },
});
