import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { AppScreen, PageHeader, SectionCard, AppButton, appColors } from "../../components/common/designSystem";
import notificationService from "../../services/notificationService";

export default function NotificationsRoute() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const list = await notificationService.loadLocalNotifications();
    setItems(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await load();
    })();
    return () => {
      mounted = false;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const unreadCount = items.filter((i) => !i.read).length;

  const handleMarkRead = async (id) => {
    const next = await notificationService.markNotificationRead(id);
    setItems(next);
  };

  const handleMarkAll = async () => {
    const next = await notificationService.markAllRead();
    setItems(next);
  };

  const renderItem = ({ item }) => (
    <Pressable
      onPress={() => {
        if (item.data?.target) router.push(item.data.target);
        handleMarkRead(item.id);
      }}
      style={[styles.card, !item.read && styles.unreadCard]}
    >
      <View style={styles.row}>
        <View style={styles.icon} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.message}>{item.body}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{new Date(item.received_at).toLocaleString()}</Text>
            <Text style={styles.meta}>{item.data?.type || "General"}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );

  const headerComponent = () => (
    <View>
      <PageHeader eyebrow="Notifications" title="Notification center" subtitle="Stay informed about alerts, announcements, and society updates." />
      <View style={styles.buttonRow}>
        <AppButton title={`Mark all read (${unreadCount})`} onPress={handleMarkAll} />
        <AppButton title="Refresh" variant="secondary" onPress={onRefresh} />
      </View>
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
    </View>
  );

  return (
    <AppScreen scrollable={false}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={headerComponent}
        ListEmptyComponent={() => (
          <View style={styles.emptyWrapper}>
            <Text style={styles.emptyText}>No notifications yet</Text>
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={appColors.blue} />}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 32 },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 14 },
  cardSpacing: { marginBottom: 14 },
  notificationRow: { paddingVertical: 12 },
  notificationTitle: { fontSize: 16, fontWeight: "700", color: appColors.navy, marginBottom: 6 },
  notificationText: { color: appColors.slate, lineHeight: 20 },
  card: { padding: 12, borderRadius: 10, backgroundColor: "#fff", marginBottom: 10 },
  unreadCard: { backgroundColor: "#eef2ff" },
  row: { flexDirection: "row", gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 10, backgroundColor: appColors.blue },
  title: { fontSize: 15, fontWeight: "700", color: appColors.navy },
  message: { color: appColors.slate, marginTop: 6 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  meta: { color: appColors.slate, fontSize: 12 },
  emptyWrapper: { padding: 24, alignItems: "center" },
  emptyText: { color: appColors.slate },
});
