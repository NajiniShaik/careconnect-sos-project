import * as Device from "expo-device";
import { Platform } from "react-native";
import { api, getAuthHeaders } from "../services/authService";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const IS_EXPO_GO = (Constants?.appOwnership || "") === "expo";

let Notifications = null; // lazy-loaded only when not Expo Go

const STORAGE_KEY = "cc_local_notifications_v1";
const REGISTERED_DEVICE_TOKEN_KEY = "cc_registered_device_token_v1";
const PENDING_DEVICE_TOKEN_KEY = "cc_pending_device_token_v1";
const NOTIFICATION_DEVICE_ID_KEY = "cc_notification_device_id_v1";

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
    if (__DEV__) {
      console.log("[notification] requestNotificationPermission failed", err);
    }
    return { status: "denied", error: err };
  }
}

export async function getDevicePushTokenAsync() {
  if (IS_EXPO_GO) return null;
  if (isWeb()) return null;
  if (!Device.isDevice) return null;

  try {
    if (!Notifications) {
      Notifications = await import("expo-notifications");
    }

    const getTokenMethod = Notifications.getDevicePushTokenAsync || Notifications.getExpoPushTokenAsync;
    if (typeof getTokenMethod !== "function") {
      return null;
    }

    const tokenData = await getTokenMethod();
    return tokenData?.data || null;
  } catch (err) {
    if (__DEV__) {
      console.log("[notification] getDevicePushTokenAsync failed", err);
    }
    return null;
  }
}

export async function getExpoPushTokenAsync() {
  return getDevicePushTokenAsync();
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

async function getRegisteredDeviceToken() {
  try {
    return await SecureStore.getItemAsync(REGISTERED_DEVICE_TOKEN_KEY);
  } catch (error) {
    return null;
  }
}

async function setRegisteredDeviceToken(token) {
  try {
    await SecureStore.setItemAsync(REGISTERED_DEVICE_TOKEN_KEY, token);
  } catch (error) {
    if (__DEV__) {
      console.log("[notification] setRegisteredDeviceToken failed", error);
    }
  }
}

export async function getPendingDeviceToken() {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_DEVICE_TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

async function setPendingDeviceToken(value) {
  try {
    await SecureStore.setItemAsync(PENDING_DEVICE_TOKEN_KEY, JSON.stringify(value));
  } catch (error) {
    if (__DEV__) {
      console.log("[notification] setPendingDeviceToken failed", error);
    }
  }
}

async function clearPendingDeviceToken() {
  try {
    await SecureStore.deleteItemAsync(PENDING_DEVICE_TOKEN_KEY);
  } catch (error) {
    if (__DEV__) {
      console.log("[notification] clearPendingDeviceToken failed", error);
    }
  }
}

export async function getNotificationDeviceId() {
  try {
    let deviceId = await SecureStore.getItemAsync(NOTIFICATION_DEVICE_ID_KEY);
    if (deviceId) {
      return deviceId;
    }

    deviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(NOTIFICATION_DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch (error) {
    if (__DEV__) {
      console.log("[notification] getNotificationDeviceId failed", error);
    }
    return `device-${Date.now()}`;
  }
}

export async function registerDeviceWithBackend({ token, platform, device_id }) {
  if (IS_EXPO_GO) {
    await SecureStore.setItemAsync(PENDING_DEVICE_TOKEN_KEY, JSON.stringify({ token, platform, device_id }));
    return { skipped: true };
  }

  if (!token) {
    throw new Error("Missing device token");
  }

  const registeredToken = await getRegisteredDeviceToken();
  if (registeredToken && registeredToken === token) {
    if (__DEV__) {
      console.log("[notification] device token already registered");
    }
    return { skipped: true };
  }

  try {
    const headers = await getAuthHeaders();
    const resp = await api.post(`/notifications/register-device/`, { device_token: token }, { headers });
    await setRegisteredDeviceToken(token);
    await clearPendingDeviceToken();
    return resp.data;
  } catch (err) {
    await setPendingDeviceToken({ token, platform, device_id });
    if (__DEV__) {
      console.log("[notification] registerDeviceWithBackend failed", err);
    }
    throw err;
  }
}

export async function retryPendingDeviceRegistration() {
  const pending = await getPendingDeviceToken();
  if (!pending || !pending.token) {
    return null;
  }

  try {
    return await registerDeviceWithBackend(pending);
  } catch (err) {
    if (__DEV__) {
      console.log("[notification] retryPendingDeviceRegistration failed", err);
    }
    return null;
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
  retryPendingDeviceRegistration,
  getNotificationDeviceId,
  saveLocalNotification,
  loadLocalNotifications,
  markNotificationRead,
  markAllRead,
};
