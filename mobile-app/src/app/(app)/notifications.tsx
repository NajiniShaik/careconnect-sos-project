import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { AppScreen, PageHeader, SectionCard, appColors } from "../../components/common/designSystem";

export default function NotificationsRoute() {
  return (
    <AppScreen>
      <PageHeader eyebrow="Notifications" title="Notification center" subtitle="Stay informed about alerts, announcements, and society updates." />

      <SectionCard title="Emergency notifications" subtitle="Your recent emergency messages." style={styles.cardSpacing}>
        <View style={styles.notificationRow}>
          <Text style={styles.notificationTitle}>No new emergency notifications</Text>
          <Text style={styles.notificationText}>You will see alerts here when the system sends them.</Text>
        </View>
      </SectionCard>

      <SectionCard title="Announcements" subtitle="Community notices and updates." style={styles.cardSpacing}>
        <View style={styles.notificationRow}>
          <Text style={styles.notificationTitle}>No announcements yet</Text>
          <Text style={styles.notificationText}>All community announcements will appear here.</Text>
        </View>
      </SectionCard>

      <SectionCard title="Society updates" subtitle="Important updates from your society." style={styles.cardSpacing}>
        <View style={styles.notificationRow}>
          <Text style={styles.notificationTitle}>No updates available</Text>
          <Text style={styles.notificationText}>Latest society updates show up in this feed.</Text>
        </View>
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: 14 },
  notificationRow: { paddingVertical: 12 },
  notificationTitle: { fontSize: 16, fontWeight: "700", color: appColors.navy, marginBottom: 6 },
  notificationText: { color: appColors.slate, lineHeight: 20 },
});
