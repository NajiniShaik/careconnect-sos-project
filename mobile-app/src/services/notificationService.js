import * as Device from "expo-device";
import { Platform } from "react-native";
import { api, getAuthHeaders } from "../services/authService";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const IS_EXPO_GO = (Constants?.appOwnership || "") === "expo";

let Notifications = null; // lazy-loaded only when not Expo Go

const STORAGE_KEY = "cc_local_notifications_v1";

function isWeb() {
  return Platform.OS === "web";
}

export async function requestNotificationPermission() {
  if (IS_EXPO_GO) {
    // Expo Go does not support push notifications for remote delivery — skip gracefully
    return { status: "expo_go" };
  }
  try {
    if (!Notifications) {
      Notifications = await import("expo-notifications");
    }
    if (isWeb()) {
      // simple web fallback
      const status = Notification.permission;
      return { status };
    }
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return { status: "granted" };
    }

    const result = await Notifications.requestPermissionsAsync();
    return { status: result.status || (result.granted ? "granted" : "denied") };
  } catch (err) {
    return { status: "denied", error: err };
  }
}

export async function getExpoPushTokenAsync() {
  if (IS_EXPO_GO) return null;
  if (isWeb()) return null;
  if (!Device.isDevice) return null;

  try {
    if (!Notifications) {
      Notifications = await import("expo-notifications");
    }
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (err) {
    return null;
  }
}

export function addNotificationListener({ onReceived, onResponse }) {
  if (IS_EXPO_GO) {
    // no-op in Expo Go
    return () => {};
  }

  let foreground = null;
  let response = null;
  (async () => {
    if (!Notifications) Notifications = await import("expo-notifications");
    foreground = Notifications.addNotificationReceivedListener(onReceived);
    response = Notifications.addNotificationResponseReceivedListener(onResponse);
  })();

  return () => {
    try { foreground?.remove?.(); } catch (e) {}
    try { response?.remove?.(); } catch (e) {}
  };
}

export async function registerDeviceWithBackend({ token, platform, device_id }) {
  if (IS_EXPO_GO) {
    // Skip server registration in Expo Go; persist locally for manual retry
    await SecureStore.setItemAsync("cc_pending_device_token", JSON.stringify({ token, platform, device_id }));
    return { skipped: true };
  }

  // use api with auth headers
  try {
    const headers = await getAuthHeaders();
    const resp = await api.post(`/notifications/register-device/`, { token, platform, device_id }, { headers });
    return resp.data;
  } catch (err) {
    // fallback: persist token locally so we can retry later
    await SecureStore.setItemAsync("cc_pending_device_token", JSON.stringify({ token, platform, device_id }));
    throw err;
  }
}

export async function saveLocalNotification(notification) {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    // avoid duplicates by id
    if (list.some((n) => n.id === notification.id)) return list;
    const next = [notification, ...list].slice(0, 200);
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    return [notification];
  }
}

export async function loadLocalNotifications() {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return list;
  } catch (err) {
    return [];
  }
}

export async function markNotificationRead(id) {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const next = list.map((n) => (n.id === id ? { ...n, read: true } : n));
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    return [];
  }
}

export async function markAllRead() {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const next = list.map((n) => ({ ...n, read: true }));
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    return [];
  }
}

export default {
  requestNotificationPermission,
  getExpoPushTokenAsync,
  addNotificationListener,
  registerDeviceWithBackend,
  saveLocalNotification,
  loadLocalNotifications,
  markNotificationRead,
  markAllRead,
};
