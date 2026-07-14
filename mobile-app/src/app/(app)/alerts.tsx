import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { AppButton, AppScreen, PageHeader, SectionCard, appColors } from "../../components/common/designSystem";
import { getStoredUser } from "../../services/authService";
import { fetchSosHistory, normalizeSosHistory } from "../../services/sosService";

export default function AlertsRoute() {
  const [user, setUser] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const storedUser = await getStoredUser();
        setUser(storedUser);

        const role = String(storedUser?.role || "").toUpperCase();

        if (role === "RESIDENT") {
          const response = await fetchSosHistory();
          const history = normalizeSosHistory(response?.data || []);
          setAlerts(history);
        } else {
          setAlerts([
            {
              id: "security-1",
              title: "Gate A access alert",
              message: "Security patrol dispatched to Gate A",
              location: "Gate A",
              status: "OPEN",
              created_at: "2 mins ago",
              category: "Security",
            },
            {
              id: "medical-1",
              title: "Medical support request",
              message: "Medical assistance requested near Block 3",
              location: "Block 3",
              status: "PENDING",
              created_at: "10 mins ago",
              category: "Medical",
            },
          ]);
        }
      } catch (error) {
        console.log("[alerts] Failed to load alerts", error);
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };

    void loadAlerts();
  }, []);

  const role = String(user?.role || "").toUpperCase();
  const isResident = role === "RESIDENT";
  const isStaff = ["ADMIN", "SECURITY", "GUARDIAN", "VOLUNTEER"].includes(role);

  const getActionLabel = (alert) => {
    if (isResident) return "View details";
    if (role === "SECURITY") return "Dispatch";
    if (role === "ADMIN") return "Escalate";
    return "Respond";
  };

  const getActionColor = (alert) => {
    if (isResident) return "secondary";
    return "danger";
  };

  return (
    <AppScreen>
      <PageHeader eyebrow="Emergency alerts" title="Dispatch center" subtitle="Review urgent updates and community alert status." />

      <SectionCard title="Emergency categories" subtitle="Choose a category to see active response details." style={styles.cardSpacing}>
        <View style={styles.categoryGrid}>
          {[
            { label: "Fire", tone: "danger" },
            { label: "Medical", tone: "success" },
            { label: "Security", tone: "warning" },
            { label: "Power", tone: "secondary" },
          ].map((item) => (
            <View key={item.label} style={[styles.categoryItem, item.tone === "danger" ? styles.categoryDanger : item.tone === "warning" ? styles.categoryWarning : item.tone === "secondary" ? styles.categorySecondary : styles.categorySuccess]}>
              <Text style={styles.categoryText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Recent alerts" subtitle={isResident ? "Your recent emergency activity" : "Role-based incident actions"} style={styles.cardSpacing}>
        {loading ? (
          <Text style={styles.alertDescription}>Loading alerts...</Text>
        ) : alerts.length === 0 ? (
          <View style={styles.alertRow}>
            <Text style={styles.alertTitle}>No recent emergency alerts</Text>
            <Text style={styles.alertDescription}>Your community has no active incidents at this time.</Text>
          </View>
        ) : (
          alerts.map((alert) => (
            <View key={alert.id} style={styles.alertRow}>
              <View style={styles.alertHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>{alert.title || alert.message}</Text>
                  <Text style={styles.alertDescription}>{alert.message}</Text>
                  <Text style={styles.metaText}>{alert.location} • {alert.status} • {alert.created_at}</Text>
                </View>
              </View>
              {isStaff ? (
                <View style={styles.actionRow}>
                  <AppButton
                    title={getActionLabel(alert)}
                    onPress={() => {}}
                    variant={getActionColor(alert)}
                    style={styles.actionButton}
                  />
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <AppButton
                    title="View details"
                    onPress={() => {}}
                    variant="secondary"
                    style={styles.actionButton}
                  />
                </View>
              )}
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Society emergency numbers" subtitle="Call local community support if needed." style={styles.cardSpacing}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Society guard</Text>
          <Text style={styles.detailValue}>+91 98765 43210</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Fire brigade</Text>
          <Text style={styles.detailValue}>101</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Police helpline</Text>
          <Text style={styles.detailValue}>100</Text>
        </View>
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: 14 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 },
  categoryItem: { width: "48%", borderRadius: 16, padding: 16, minHeight: 90, justifyContent: "center" },
  categoryText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  categoryDanger: { backgroundColor: "#ef4444" },
  categoryWarning: { backgroundColor: "#f59e0b" },
  categorySuccess: { backgroundColor: "#2563eb" },
  categorySecondary: { backgroundColor: "#475569" },
  alertRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: appColors.border },
  alertHeaderRow: { flexDirection: "row", alignItems: "flex-start" },
  alertTitle: { fontSize: 16, fontWeight: "700", color: appColors.navy, marginBottom: 6 },
  alertDescription: { color: appColors.slate, lineHeight: 20 },
  metaText: { color: appColors.muted, fontSize: 12, marginTop: 4 },
  actionRow: { marginTop: 10, alignItems: "flex-start" },
  actionButton: { minWidth: 140 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: appColors.border },
  detailLabel: { color: appColors.slate },
  detailValue: { color: appColors.navy, fontWeight: "700" },
});
