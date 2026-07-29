import * as Device from "expo-device";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api, getAuthHeaders, getStoredToken, getStoredUser, waitForAuthReady } from "../services/authService";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const MEMORY_STORAGE = globalThis.__cc_notification_storage || (globalThis.__cc_notification_storage = {});

const IS_EXPO_GO = (Constants?.appOwnership || "") === "expo";


const STORAGE_KEY = "cc_local_notifications_v1";
const REGISTERED_DEVICE_TOKEN_KEY = "cc_registered_device_token_v1";
const PENDING_DEVICE_TOKEN_KEY = "cc_pending_device_token_v1";
const NOTIFICATION_DEVICE_ID_KEY = "cc_notification_device_id_v1";
const NOTIFICATION_UPDATE_SUBSCRIBERS = new Set();
const NOTIFICATION_LISTENER_STATE = globalThis.__cc_notification_listener_state || (globalThis.__cc_notification_listener_state = {});
const FOREGROUND_NOTIFICATION_IDS = globalThis.__cc_foreground_notification_ids || (globalThis.__cc_foreground_notification_ids = new Set());
const SOS_NOTIFICATION_CATEGORY = "sos-alert";
const POLL_INTERVAL_MS = 30000;
const POLL_STATE = globalThis.__cc_notification_poll_state || (globalThis.__cc_notification_poll_state = { intervalId: null, active: false });
const FETCH_STATE = globalThis.__cc_notification_fetch_state || (globalThis.__cc_notification_fetch_state = { inFlight: false, lastFetchAt: 0, cooldownMs: 2000 });
const REGISTRATION_STATE = globalThis.__cc_notification_registration_state || (globalThis.__cc_notification_registration_state = { loggedOut: false, lastRegisteredToken: null, lastRegisteredUserId: null, lastRegisteredUserRole: null });

async function ensureAndroidNotificationChannel() {
  if (isWeb() || Platform.OS !== "android") {
    return null;
  }

  try {
    await Notifications.setNotificationChannelAsync("careconnect-alerts", {
      name: "CareConnect Alerts",
      importance: Notifications.AndroidImportance.MAX,
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#208AEF",
      sound: "default",
    });
  } catch (error) {
    if (__DEV__) {
      console.log("[notification] channel setup failed", error);
    }
  }
}

async function ensureNotificationCategories() {
  if (isWeb()) {
    return null;
  }

  try {
    await Notifications.setNotificationCategoryAsync(SOS_NOTIFICATION_CATEGORY, [
      {
        identifier: "accept",
        buttonTitle: "Accept",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "view",
        buttonTitle: "View",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "dismiss",
        buttonTitle: "Not Now",
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (error) {
    if (__DEV__) {
      console.log("[notification] category setup failed", error);
    }
  }
}

if (typeof Notifications.setNotificationHandler === "function") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

void ensureAndroidNotificationChannel();
void ensureNotificationCategories();

function isWeb() {
  return Platform.OS === "web";
}

function maskToken(token) {
  if (!token) return "";
  const text = String(token);
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
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

function emitNotificationUpdate(payload) {
  for (const subscriber of Array.from(NOTIFICATION_UPDATE_SUBSCRIBERS)) {
    try {
      subscriber?.(payload);
    } catch (error) {
      // ignore subscriber errors
    }
  }
}

export function markAuthenticatedSession() {
  REGISTRATION_STATE.loggedOut = false;
}

export async function cleanupOnLogout() {
  REGISTRATION_STATE.loggedOut = true;
  REGISTRATION_STATE.lastRegisteredToken = null;
  REGISTRATION_STATE.lastRegisteredUserId = null;
  REGISTRATION_STATE.lastRegisteredUserRole = null;
  await unregisterDeviceFromBackend().catch(() => {});
  await clearRegisteredDeviceToken();
  await clearPendingDeviceToken();
  clearNotificationState();
}

export function clearNotificationState() {
  stopNotificationsPolling();
  clearNotificationListeners();
  FOREGROUND_NOTIFICATION_IDS.clear();
  NOTIFICATION_UPDATE_SUBSCRIBERS.clear();
}

export function stopNotificationsPolling() {
  if (POLL_STATE.intervalId) {
    clearInterval(POLL_STATE.intervalId);
  }
  POLL_STATE.intervalId = null;
  POLL_STATE.active = false;
}

export async function startNotificationsPolling() {
  if (isWeb()) {
    return false;
  }

  if (REGISTRATION_STATE.loggedOut) {
    stopNotificationsPolling();
    return false;
  }

  const authToken = await getStoredTokenFromAnywhere();
  const currentUser = await getStoredUser();
  if (!authToken || !currentUser?.id) {
    stopNotificationsPolling();
    return false;
  }

  if (POLL_STATE.intervalId) {
    return true;
  }

  POLL_STATE.active = true;

  void fetchNotificationsFromBackend();

  POLL_STATE.intervalId = setInterval(() => {
    void (async () => {
      try {
        const activeToken = await getStoredTokenFromAnywhere();
        const activeUser = await getStoredUser();
        if (!activeToken || !activeUser?.id || REGISTRATION_STATE.loggedOut) {
          stopNotificationsPolling();
          return;
        }
        await fetchNotificationsFromBackend();
      } catch (error) {
        if (__DEV__) {
          console.log("[notification] polling failed", error);
        }
      }
    })();
  }, POLL_INTERVAL_MS);

  return true;
}

export function clearNotificationListeners() {
  if (NOTIFICATION_LISTENER_STATE.cleanup) {
    try {
      NOTIFICATION_LISTENER_STATE.cleanup();
    } catch (error) {
      // ignore cleanup errors
    }
    NOTIFICATION_LISTENER_STATE.cleanup = null;
  }
}

export function subscribeToNotificationUpdates(callback) {
  NOTIFICATION_UPDATE_SUBSCRIBERS.add(callback);
  return () => {
    NOTIFICATION_UPDATE_SUBSCRIBERS.delete(callback);
  };
}

async function getStoredTokenFromAnywhere() {
  try {
    const token = await waitForAuthReady();
    if (token) {
      return token;
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
  const runtimeInfo = {
    isExpoGo: IS_EXPO_GO,
    isWeb: isWeb(),
    isDevice: Device.isDevice,
    osName: Device.osName,
    platformOS: Platform.OS,
  };

  if (IS_EXPO_GO) {
    console.log("[notification] skipping push token generation because Expo Go is in use", runtimeInfo);
    return null;
  }
  if (isWeb()) {
    console.log("[notification] skipping push token generation because the app is running on web", runtimeInfo);
    return null;
  }
  if (!Device.isDevice) {
    console.log("[notification] skipping push token generation because the runtime is not a physical device", runtimeInfo);
    return null;
  }

  try {
    if (typeof Notifications.getDevicePushTokenAsync !== "function") {
      console.log("[notification] getDevicePushTokenAsync is not available in this runtime", runtimeInfo);
      return null;
    }

    const tokenData = await Notifications.getDevicePushTokenAsync();
    const resolvedToken = tokenData?.data || null;
    console.log("[notification] resolved push token", { ...runtimeInfo, token: resolvedToken ? `${resolvedToken.slice(0, 8)}...` : null });
    return resolvedToken;
  } catch (err) {
    if (__DEV__) {
      console.log("[notification] getDevicePushTokenAsync failed", { ...runtimeInfo, error: err });
    }
    return null;
  }
}

export async function getExpoPushTokenAsync() {
  return getDevicePushTokenAsync();
}

export function addPushTokenListener(onTokenReceived) {
  if (IS_EXPO_GO || isWeb()) {
    return () => {};
  }

  const listenerFactory = Notifications.addPushTokenListener;
  if (typeof listenerFactory !== "function") {
    return () => {};
  }

  const subscription = listenerFactory((tokenData) => {
    const token = tokenData?.data || tokenData?.token || tokenData || null;
    onTokenReceived?.(token);
  });

  return () => {
    try { subscription?.remove?.(); } catch (e) {}
  };
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

  if (NOTIFICATION_LISTENER_STATE.cleanup) {
    return NOTIFICATION_LISTENER_STATE.cleanup;
  }

  const foreground = Notifications.addNotificationReceivedListener((event) => {
    onReceived?.(event);
  });
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    onResponse?.(event);
  });

  const cleanup = () => {
    try { foreground?.remove?.(); } catch (e) {}
    try { response?.remove?.(); } catch (e) {}
    if (NOTIFICATION_LISTENER_STATE.cleanup === cleanup) {
      NOTIFICATION_LISTENER_STATE.cleanup = null;
    }
  };

  NOTIFICATION_LISTENER_STATE.cleanup = cleanup;
  return cleanup;
}

async function getRegisteredDeviceToken() {
  try {
    const storedValue = await SecureStore.getItemAsync(REGISTERED_DEVICE_TOKEN_KEY);
    if (!storedValue) return null;

    try {
      const parsedValue = JSON.parse(storedValue);
      if (parsedValue && typeof parsedValue === "object") {
        return parsedValue;
      }
    } catch (error) {
      // fall back to the legacy plain-string representation
    }

    return { token: storedValue, userId: null, userRole: null };
  } catch (error) {
    return null;
  }
}

async function clearRegisteredDeviceToken() {
  try {
    await SecureStore.deleteItemAsync(REGISTERED_DEVICE_TOKEN_KEY);
  } catch (error) {
    if (__DEV__) {
      console.log("[notification] clearRegisteredDeviceToken failed", error);
    }
  }
}

async function unregisterDeviceFromBackend(token = null) {
  try {
    const registrationRecord = await getRegisteredDeviceToken();
    const resolvedToken = token || registrationRecord?.token;
    if (!resolvedToken) {
      return { skipped: true, reason: "missing-token" };
    }

    const authToken = await getStoredToken();
    if (!authToken) {
      return { skipped: true, reason: "not-authenticated" };
    }

    const headers = await getAuthHeaders(authToken);
    await api.delete(`/notifications/register-device/`, { headers, params: { token: resolvedToken } });
    await clearRegisteredDeviceToken();
    await clearPendingDeviceToken();
    return { success: true, token: resolvedToken };
  } catch (err) {
    if (__DEV__) {
      console.log("[notification] unregisterDeviceFromBackend failed", err?.response?.data || err);
    }
    return { skipped: true, reason: "failed", error: err?.message || String(err) };
  }
}

async function setRegisteredDeviceToken(token, userInfo = null) {
  try {
    const currentUser = userInfo || (await getStoredUser());
    const payload = {
      token,
      userId: currentUser?.id || currentUser?.pk || null,
      userRole: currentUser?.role || null,
      updatedAt: new Date().toISOString(),
    };
    await SecureStore.setItemAsync(REGISTERED_DEVICE_TOKEN_KEY, JSON.stringify(payload));
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

  const normalizedToken = typeof token === "string" ? token.trim() : "";
  if (!normalizedToken) {
    const runtimeInfo = {
      isExpoGo: IS_EXPO_GO,
      isWeb: isWeb(),
      isDevice: Device.isDevice,
      osName: Device.osName,
      platformOS: Platform.OS,
      token,
      platform,
      device_id,
    };
    console.error("[notification] refusing to register because the device token is blank", runtimeInfo);
    throw new Error("Missing device token");
  }

  const authToken = await getStoredToken();
  if (!authToken) {
    return { skipped: true, reason: "not-authenticated" };
  }

  const currentUser = await getStoredUser();
  const currentUserId = currentUser?.id || currentUser?.pk || null;
  const currentRole = currentUser?.role || null;
  if (!currentUserId) {
    return { skipped: true, reason: "missing-user-id" };
  }

  if (REGISTRATION_STATE.loggedOut) {
    return { skipped: true, reason: "logged-out" };
  }

  const registrationRecord = await getRegisteredDeviceToken();
  const isSameUserRegistration = Boolean(
    registrationRecord?.token === token &&
    registrationRecord?.userId != null &&
    registrationRecord.userId === currentUserId &&
    registrationRecord.userRole === currentRole
  );

  if (isSameUserRegistration || (REGISTRATION_STATE.lastRegisteredToken === token && REGISTRATION_STATE.lastRegisteredUserId === currentUserId && REGISTRATION_STATE.lastRegisteredUserRole === currentRole)) {
    if (__DEV__) {
      console.log("[notification] device token already registered for the current user");
    }
    return { skipped: true, reason: "already-registered" };
  }

  try {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) {
      return { skipped: true, reason: "missing-auth-header" };
    }

    const normalizedPlatform = (typeof platform === "string" && platform ? String(platform) : (Device.osName || Platform.OS || "unknown")).toLowerCase();
    const payload = { device_token: normalizedToken, platform: normalizedPlatform, device_id };
    console.log("[notification] posting device registration payload", payload);

    const resp = await api.post(
      `/notifications/register-device/`,
      payload,
      { headers }
    );

    REGISTRATION_STATE.lastRegisteredToken = normalizedToken;
    REGISTRATION_STATE.lastRegisteredUserId = currentUserId;
    REGISTRATION_STATE.lastRegisteredUserRole = currentRole;

    await setRegisteredDeviceToken(normalizedToken, currentUser);
    await clearPendingDeviceToken();
    return resp.data;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      stopNotificationsPolling();
      return { skipped: true, reason: "unauthorized" };
    }

    await setPendingDeviceToken({ token, platform, device_id, userId: currentUserId, userRole: currentRole });
    if (__DEV__) {
      console.log("[notification] registerDeviceWithBackend failed", {
        status,
        error: err?.message || err,
        response: err?.response?.data,
      });
    }
    throw err;
  }
}

export async function ensureDeviceRegistration() {
  if (REGISTRATION_STATE.loggedOut) {
    return { skipped: true, reason: "logged-out" };
  }

  const authToken = await getStoredToken();
  if (!authToken) {
    return { skipped: true, reason: "not-authenticated" };
  }

  const currentUser = await getStoredUser();
  if (!currentUser?.id) {
    return { skipped: true, reason: "missing-user-id" };
  }

  markAuthenticatedSession();

  await ensureAndroidNotificationChannel();
  await ensureNotificationCategories();

  const permission = await requestNotificationPermission();
  if (permission?.status !== "granted") {
    return { skipped: true, reason: "permission-not-granted", permission };
  }

  const deviceToken = await getDevicePushTokenAsync();
  console.log("[notification] ensureDeviceRegistration runtime", {
    isExpoGo: IS_EXPO_GO,
    isWeb: isWeb(),
    isDevice: Device.isDevice,
    osName: Device.osName,
    platformOS: Platform.OS,
    deviceToken: deviceToken ? `${deviceToken.slice(0, 8)}...` : null,
  });
  if (!deviceToken) {
    return { skipped: true, reason: "missing-token" };
  }

  const platform = (Device.osName || Platform.OS || "unknown").toLowerCase();
  const deviceId = await getNotificationDeviceId();
  return registerDeviceWithBackend({ token: deviceToken, platform, device_id: deviceId });
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

export function shouldProcessForegroundNotification(notificationId) {
  const id = notificationId == null ? null : String(notificationId);
  if (!id) {
    return true;
  }
  if (FOREGROUND_NOTIFICATION_IDS.has(id)) {
    return false;
  }
  FOREGROUND_NOTIFICATION_IDS.add(id);
  return true;
}

export async function saveLocalNotification(notification) {
  try {
    const list = getStorageKeyValue(STORAGE_KEY) || [];
    if (list.some((n) => n.id === notification.id)) {
      emitNotificationUpdate(list);
      return list;
    }
    const next = [notification, ...list].slice(0, 200);
    setStorageKeyValue(STORAGE_KEY, next);
    emitNotificationUpdate(next);
    return next;
  } catch (err) {
    emitNotificationUpdate([notification]);
    return [notification];
  }
}

export async function fetchNotificationsFromBackend() {
  if (REGISTRATION_STATE.loggedOut) {
    return loadLocalNotifications();
  }

  const now = Date.now();
  if (FETCH_STATE.inFlight) {
    return loadLocalNotifications();
  }
  if (FETCH_STATE.lastFetchAt && now - FETCH_STATE.lastFetchAt < FETCH_STATE.cooldownMs) {
    return loadLocalNotifications();
  }

  FETCH_STATE.inFlight = true;
  FETCH_STATE.lastFetchAt = now;

  try {
    const token = await getStoredTokenFromAnywhere();
    if (!token) {
      return loadLocalNotifications();
    }

    const headers = await getAuthHeaders(token);
    const resp = await api.get(`/notifications/notifications/`, { headers });
    const list = Array.isArray(resp?.data) ? resp.data : [];
    setStorageKeyValue(STORAGE_KEY, list);
    emitNotificationUpdate(list);
    return list;
  } catch (err) {
    if (err?.response?.status === 401 || err?.response?.status === 403) {
      stopNotificationsPolling();
      return loadLocalNotifications();
    }
    if (__DEV__) {
      console.log("[notification] fetchNotificationsFromBackend failed", {
        status: err?.response?.status,
        message: err?.message || err,
      });
    }
    return loadLocalNotifications();
  } finally {
    FETCH_STATE.inFlight = false;
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

    const headers = await getAuthHeaders(token);
    await api.post(`/notifications/notifications/${id}/read/`, {}, { headers });
    const list = await loadLocalNotifications();
    const next = list.map((n) => (n.id === id ? { ...n, read: true } : n));
    setStorageKeyValue(STORAGE_KEY, next);
    emitNotificationUpdate(next);
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

    const headers = await getAuthHeaders(token);
    await api.post(`/notifications/mark-all-read/`, {}, { headers });
    const list = await loadLocalNotifications();
    const next = list.map((n) => ({ ...n, read: true }));
    setStorageKeyValue(STORAGE_KEY, next);
    emitNotificationUpdate(next);
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

    const headers = await getAuthHeaders(token);
    await api.delete(`/notifications/notifications/${id}/`, { headers });
    const list = await loadLocalNotifications();
    const next = list.filter((n) => n.id !== id);
    setStorageKeyValue(STORAGE_KEY, next);
    emitNotificationUpdate(next);
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
  addPushTokenListener,
  ensureDeviceRegistration,
  registerDeviceWithBackend,
  startNotificationsPolling,
  stopNotificationsPolling,
  cleanupOnLogout,
  markAuthenticatedSession,
  clearNotificationListeners,
  clearNotificationState,
  shouldProcessForegroundNotification,
  retryPendingDeviceRegistration,
  getNotificationDeviceId,
  saveLocalNotification,
  loadLocalNotifications,
  subscribeToNotificationUpdates,
  fetchNotificationsFromBackend,
  markNotificationRead,
  markAllRead,
  deleteNotification,
};
