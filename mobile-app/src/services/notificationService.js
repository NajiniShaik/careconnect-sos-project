import * as Device from "expo-device";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api, getAuthHeaders } from "../services/authService";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const MEMORY_STORAGE = globalThis.__cc_notification_storage || (globalThis.__cc_notification_storage = {});

const IS_EXPO_GO = (Constants?.appOwnership || "") === "expo";


const STORAGE_KEY = "cc_local_notifications_v1";
const REGISTERED_DEVICE_TOKEN_KEY = "cc_registered_device_token_v1";
const PENDING_DEVICE_TOKEN_KEY = "cc_pending_device_token_v1";
const NOTIFICATION_DEVICE_ID_KEY = "cc_notification_device_id_v1";

function isWeb() {
  return Platform.OS === "web";
}

function getStorageKeyValue(key) {
  try {
    if (isWeb() && typeof globalThis.localStorage !== "undefined") {
      const value = globalThis.localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    }
  } catch (error) {
    // fall back to memory storage below
  }

  const value = MEMORY_STORAGE[key];
  return value == null ? null : value;
}

function setStorageKeyValue(key, value) {
  try {
    if (isWeb() && typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(key, JSON.stringify(value));
      return;
    }
  } catch (error) {
    // fall back to memory storage below
  }

  MEMORY_STORAGE[key] = value;
}

async function getStoredTokenFromAnywhere() {
  try {
    const token = await getAuthHeaders();
    if (token?.Authorization) {
      return token.Authorization.replace("Bearer ", "");
    }
  } catch (error) {
    // ignore and fall back below
  }

  try {
    const headers = await getAuthHeaders();
    const authHeader = headers?.Authorization || "";
    return authHeader.replace("Bearer ", "");
  } catch (error) {
    return null;
  }
}

export async function requestNotificationPermission() {
  if (IS_EXPO_GO) {
    // Expo Go does not support push notifications for remote delivery — skip gracefully
    return { status: "expo_go" };
  }

  try {
    if (isWeb()) {
      if (typeof Notification === "undefined") return { status: "denied" };
      const current = Notification.permission;
      if (current === "granted") return { status: "granted" };
      if (current === "denied") return { status: "denied" };
      const res = await Notification.requestPermission();
      return { status: res };
    }

    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications?.IosAuthorizationStatus?.PROVISIONAL) {
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

export async function getNotificationPermissionStatus() {
  if (IS_EXPO_GO) {
    return "expo_go";
  }

  try {
    if (isWeb()) {
      return (typeof Notification !== "undefined" && Notification.permission) || "denied";
    }

    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications?.IosAuthorizationStatus?.PROVISIONAL) {
      return "granted";
    }
    if (settings.denied || settings.ios?.status === Notifications?.IosAuthorizationStatus?.DENIED) {
      return "denied";
    }
    return settings.status || "undetermined";
  } catch (err) {
    if (__DEV__) {
      console.log("[notification] getNotificationPermissionStatus failed", err);
    }
    return "denied";
  }
}

export async function getDevicePushTokenAsync() {
  if (IS_EXPO_GO) return null;
  if (isWeb()) return null;
  if (!Device.isDevice) return null;

  try {
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

  if (isWeb()) {
    // On web we don't use expo-notifications listeners
    return () => {};
  }

  const foreground = Notifications.addNotificationReceivedListener(onReceived);
  const response = Notifications.addNotificationResponseReceivedListener(onResponse);

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
    const list = getStorageKeyValue(STORAGE_KEY) || [];
    if (list.some((n) => n.id === notification.id)) return list;
    const next = [notification, ...list].slice(0, 200);
    setStorageKeyValue(STORAGE_KEY, next);
    return next;
  } catch (err) {
    return [notification];
  }
}

export async function fetchNotificationsFromBackend() {
  try {
    console.log("[notification] Fetching notifications...");
    const token = await getStoredTokenFromAnywhere();
    if (!token) {
      console.log("[notification] Token not found");
      return loadLocalNotifications();
    }

    console.log("[notification] Token found");
    const headers = { Authorization: `Bearer ${token}` };
    const resp = await api.get(`/notifications/notifications/`, { headers });
    console.log("[notification] GET /notifications status", resp?.status);
    const list = Array.isArray(resp?.data) ? resp.data : [];
    console.log("[notification] Notifications received:", list.length);
    setStorageKeyValue(STORAGE_KEY, list);
    return list;
  } catch (err) {
    console.log("[notification] Fetch failed", err);
    return loadLocalNotifications();
  }
}

export async function loadLocalNotifications() {
  try {
    const list = getStorageKeyValue(STORAGE_KEY) || [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

export async function markNotificationRead(id) {
  try {
    const token = await getStoredTokenFromAnywhere();
    if (!token) {
      return loadLocalNotifications();
    }

    const headers = { Authorization: `Bearer ${token}` };
    await api.post(`/notifications/notifications/${id}/read/`, {}, { headers });
    const list = await loadLocalNotifications();
    const next = list.map((n) => (n.id === id ? { ...n, read: true } : n));
    setStorageKeyValue(STORAGE_KEY, next);
    return next;
  } catch (err) {
    if (__DEV__) {
      console.log("[notification] markNotificationRead failed", err);
    }
    return loadLocalNotifications();
  }
}

export async function markAllRead() {
  try {
    const token = await getStoredTokenFromAnywhere();
    if (!token) {
      return loadLocalNotifications();
    }

    const headers = { Authorization: `Bearer ${token}` };
    await api.post(`/notifications/mark-all-read/`, {}, { headers });
    const list = await loadLocalNotifications();
    const next = list.map((n) => ({ ...n, read: true }));
    setStorageKeyValue(STORAGE_KEY, next);
    return next;
  } catch (err) {
    if (__DEV__) {
      console.log("[notification] markAllRead failed", err);
    }
    return loadLocalNotifications();
  }
}

export async function deleteNotification(id) {
  try {
    const token = await getStoredTokenFromAnywhere();
    if (!token) {
      const local = await loadLocalNotifications();
      const nextLocal = local.filter((n) => n.id !== id);
      setStorageKeyValue(STORAGE_KEY, nextLocal);
      return nextLocal;
    }

    const headers = { Authorization: `Bearer ${token}` };
    await api.delete(`/notifications/notifications/${id}/`, { headers });
    const list = await loadLocalNotifications();
    const next = list.filter((n) => n.id !== id);
    setStorageKeyValue(STORAGE_KEY, next);
    return next;
  } catch (err) {
    if (__DEV__) {
      console.log("[notification] deleteNotification failed", err);
    }
    return loadLocalNotifications();
  }
}

export default {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  getExpoPushTokenAsync,
  addNotificationListener,
  registerDeviceWithBackend,
  retryPendingDeviceRegistration,
  getNotificationDeviceId,
  saveLocalNotification,
  loadLocalNotifications,
  fetchNotificationsFromBackend,
  markNotificationRead,
  markAllRead,
  deleteNotification,
};
