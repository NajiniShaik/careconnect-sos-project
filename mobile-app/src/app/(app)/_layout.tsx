import { Tabs, useRouter } from "expo-router";
import React, { useCallback, useEffect } from "react";
import { AppIcon, appColors } from "../../components/common/designSystem";
import { getStoredToken, getStoredUser } from "../../services/authService";
import {
  cleanupOnLogout,
  stopNotificationsPolling,
  startNotificationsPolling,
  ensureDeviceRegistration,
  addNotificationListener,
  shouldProcessForegroundNotification,
  saveLocalNotification,
  fetchNotificationsFromBackend,
  clearNotificationListeners,
} from "../../services/notificationService";
import { Platform, type ColorValue } from "react-native";
import * as Notifications from "expo-notifications";

export default function AppLayout() {
  const router = useRouter();

  const verifyAuth = useCallback(async () => {
    const token = await getStoredToken();
    const user = await getStoredUser();
    console.log("[layout] verifyAuth", { hasToken: Boolean(token), hasUser: Boolean(user?.id) });
    if (!token || !user?.id) {
      cleanupOnLogout();
      stopNotificationsPolling();
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    void verifyAuth();
  }, [verifyAuth]);

  // initialize notifications when app layout mounts and user is authenticated
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const init = async () => {
      const token = await getStoredToken();
      const user = await getStoredUser();
      if (!token || !user?.id) {
        cleanupOnLogout();
        stopNotificationsPolling();
        return;
      }

      await startNotificationsPolling();
      try {
        await ensureDeviceRegistration();
      } catch {
        // ignore registration errors; the service will retry later
      }

      const handleNotificationResponse = async (response: Notifications.NotificationResponse) => {
        const actionIdentifier = response?.actionIdentifier || null;
        const data = response?.notification?.request?.content?.data || {};
        const notificationId = data?.id || data?.notification_id || null;
        const trimmedAlertId = data?.alert_id || data?.alertId || data?.alertid || null;
        const target =
          data?.target ||
          (data?.type === "COMMUNITY_BROADCAST" || data?.broadcast === true ? "/volunteer-incidents" : null) ||
          (data?.type === "SECURITY_ALERT" ? "/security-incidents" : null) ||
          (data?.type === "SOS" && trimmedAlertId ? `/alerts?alert_id=${trimmedAlertId}` : null) ||
          "/notifications";

        if (actionIdentifier === "dismiss") {
          try {
            const identifier = response?.notification?.request?.identifier;
            if (identifier) {
              await Notifications.dismissNotificationAsync(identifier);
            }
          } catch {
            // ignore dismissal errors
          }
          return;
        }

        if (actionIdentifier === "accept" || actionIdentifier === "view") {
          const baseTarget = "/notifications";
          const detailTarget = notificationId ? `${baseTarget}?selectedId=${encodeURIComponent(String(notificationId))}` : baseTarget;
          try {
            setTimeout(() => {
              try {
                router.push(detailTarget);
              } catch {
                // ignore navigation errors
              }
            }, 0);
          } catch {
            // ignore navigation errors
          }
          return;
        }

        try {
          setTimeout(() => {
            try {
              router.push(target);
            } catch {
              // ignore navigation errors
            }
          }, 0);
        } catch {
          // ignore navigation errors
        }
      };

      unsub = addNotificationListener({
        onReceived: async (n: Notifications.Notification) => {
          const payload = n.request.content;
          const notificationData = payload.data || {};
          const notificationId = notificationData.id || notificationData.notification_id || null;
          if (!shouldProcessForegroundNotification(notificationId)) {
            return;
          }

          const notificationEntry = {
            id: notificationId || `${Date.now()}`,
            title: payload.title || "New notification",
            body: payload.body || "You have a new notification",
            data: notificationData,
            read: false,
            received_at: new Date().toISOString(),
            kind: notificationData.type || payload.data?.kind || "GENERAL",
          };

          await saveLocalNotification(notificationEntry);
          try {
            await fetchNotificationsFromBackend();
          } catch {
            // ignore refresh errors
          }

          if (Platform.OS !== "web") {
            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: notificationEntry.title,
                  body: notificationEntry.body,
                  data: notificationEntry.data,
                  categoryIdentifier: notificationData.type === "SOS" || notificationData.type === "EMERGENCY" ? "sos-alert" : undefined,
                },
                trigger: null,
              });
            } catch {
              // ignore foreground presentation errors
            }
          }
        },
        onResponse: handleNotificationResponse,
      });

      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) {
          handleNotificationResponse(lastResponse);
        }
      } catch {
        // ignore initial-response lookup errors
      }
    };

    void init();
    return () => {
      if (unsub) unsub();
      clearNotificationListeners();
      stopNotificationsPolling();
    };
  }, [router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: appColors.blue as ColorValue,
        tabBarInactiveTintColor: appColors.slate as ColorValue,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: appColors.border,
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <AppIcon name="home-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color }) => <AppIcon name="warning-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color }) => <AppIcon name="people-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color }) => <AppIcon name="time-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <AppIcon name="settings-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="volunteer-incidents"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
