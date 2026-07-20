import { Tabs, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect } from "react";
import { AppIcon, appColors } from "../../components/common/designSystem";
import { getStoredToken } from "../../services/authService";
import notificationService from "../../services/notificationService";
import * as Device from "expo-device";
import { Platform } from "react-native";

export default function AppLayout() {
  const router = useRouter();

  const verifyAuth = useCallback(async () => {
    const token = await getStoredToken();
    console.log("[layout] verifyAuth", { hasToken: Boolean(token) });
    if (!token) {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    void verifyAuth();
  }, [verifyAuth]);

  // initialize notifications when app layout mounts and user is authenticated
  useEffect(() => {
    let unsub = null;
    const init = async () => {
      const token = await getStoredToken();
      if (!token) return;

      const perm = await notificationService.requestNotificationPermission();
      if ((perm && perm.status === "granted") || perm.status === "granted") {
        try {
          const expoToken = await notificationService.getExpoPushTokenAsync();
          const platform = (Device.osName || Platform.OS || "unknown").toLowerCase();
          const deviceId = `${Device.modelName || "device"}-${Date.now()}`;
          if (expoToken) {
            try {
              await notificationService.registerDeviceWithBackend({ token: expoToken, platform: platform, device_id: deviceId });
            } catch (err) {
              // register failed - will retry later
            }
          }
        } catch (e) {
          // ignore
        }
      }

      unsub = notificationService.addNotificationListener({
        onReceived: (n) => {
          // save locally
          const payload = n.request.content;
          void notificationService.saveLocalNotification({
            id: payload.data?.id || `${Date.now()}`,
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            read: false,
            received_at: new Date().toISOString(),
          });
        },
        onResponse: (r) => {
          // navigate on tap
          const data = r.notification.request.content.data || {};
          const target = data?.target || null;
          if (target) {
            // use router to navigate
            try {
              router.push(target);
            } catch (e) {
              // ignore navigation errors
            }
          }
        },
      });
    };

    void init();
    return () => {
      if (unsub) unsub();
    };
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void verifyAuth();
    }, [verifyAuth])
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: appColors.blue,
        tabBarInactiveTintColor: appColors.slate,
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
    </Tabs>
  );
}
