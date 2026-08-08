import { create } from "axios";
import Constants from "expo-constants";
import appConfig from "../../app.json";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

function isWebEnvironment() {
  return Platform.OS === "web";
}

function hasLocalStorage() {
  return isWebEnvironment() && typeof globalThis.localStorage !== "undefined";
}

function getLocalStorageItem(key) {
  if (!hasLocalStorage()) return null;
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocalStorageItem(key, value) {
  if (!hasLocalStorage()) return;
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function removeLocalStorageItem(key) {
  if (!hasLocalStorage()) return;
  try {
    globalThis.localStorage.removeItem(key);
  } catch {
    // ignore remove errors
  }
}

let cachedAccessToken = null;
let tokenLoadPromise = null;

function getAppJsonApiBaseUrl() {
  const rawConfig = appConfig?.default ?? appConfig;
  return String(rawConfig?.expo?.extra?.apiBaseUrl || "").trim();
}

function getConstantsApiBaseUrl() {
  const configBaseUrl =
    Constants?.expoConfig?.extra?.apiBaseUrl ||
    Constants?.manifest2?.extra?.apiBaseUrl ||
    Constants?.manifest?.extra?.apiBaseUrl ||
    Constants?.default?.expoConfig?.extra?.apiBaseUrl ||
    Constants?.default?.manifest2?.extra?.apiBaseUrl ||
    Constants?.default?.manifest?.extra?.apiBaseUrl ||
    "";
  return String(configBaseUrl || "").trim();
}

function getRuntimeEnvApiBaseUrl() {
  return (
    String(globalThis?.process?.env?.EXPO_PUBLIC_API_BASE_URL || "").trim() ||
    String(globalThis?.process?.env?.API_BASE_URL || "").trim()
  );
}

function getRuntimeApiBaseUrl() {
  const runtimeBaseUrl = getRuntimeEnvApiBaseUrl();
  if (runtimeBaseUrl) {
    return runtimeBaseUrl;
  }

  const constantsBaseUrl = getConstantsApiBaseUrl();
  if (constantsBaseUrl) {
    return constantsBaseUrl;
  }

  const appJsonBaseUrl = getAppJsonApiBaseUrl();
  if (appJsonBaseUrl) {
    return appJsonBaseUrl;
  }

  if (isWebEnvironment()) {
    return "http://127.0.0.1:8000/api";
  }

  return "";
}

function normalizeApiBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/u, "");
}

export function getApiBaseUrl() {
  return normalizeApiBaseUrl(getRuntimeApiBaseUrl());
}

export const API_BASE_URL = getApiBaseUrl();

if (typeof globalThis !== "undefined") {
  globalThis.__CARECONNECT_API_BASE_URL__ = API_BASE_URL;
  globalThis.__CARECONNECT_RUNTIME_API_BASE_URL__ = getRuntimeApiBaseUrl();
  globalThis.__CARECONNECT_APP_JSON_API_BASE_URL__ = getAppJsonApiBaseUrl();
  globalThis.__CARECONNECT_CONSTANTS_API_BASE_URL__ = getConstantsApiBaseUrl();
}

console.log("Platform:", Platform.OS);
console.log("API:", API_BASE_URL);

export const api = create({
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const url = config.url || "";
  const resolvedBaseUrl = String(config.baseURL || getApiBaseUrl() || "").trim();
  if (resolvedBaseUrl) {
    config.baseURL = resolvedBaseUrl;
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    try {
      console.log("[authService] REQUEST URL:", url, "baseURL:", config.baseURL);
    } catch (e) {}
  }

  const isAuthEndpoint = url.includes("/login/") || url.includes("/register/");
  if (isAuthEndpoint) {
    return config;
  }

  return buildAuthRequestConfig(config);
});

export async function persistAuth(tokens, user) {
  const accessToken = tokens?.access || null;
  const refreshToken = tokens?.refresh || null;

  if (isWebEnvironment()) {
    setLocalStorageItem("access", accessToken || "");
    setLocalStorageItem("refresh", refreshToken || "");
    setLocalStorageItem("user", JSON.stringify(user));
    setLocalStorageItem("auth-session-state", "logged-in");
  } else {
    try {
      await SecureStore.setItemAsync("access", accessToken || "");
      await SecureStore.setItemAsync("refresh", refreshToken || "");
      await SecureStore.setItemAsync("user", JSON.stringify(user));
    } catch (error) {
      if (__DEV__) {
        console.log("[auth] persistAuth failed", { message: error?.message });
      }
    }
  }

  cachedAccessToken = accessToken;
  tokenLoadPromise = Promise.resolve(accessToken);
}

export async function getStoredToken() {
  if (cachedAccessToken !== null) {
    return cachedAccessToken;
  }

  if (tokenLoadPromise) {
    return tokenLoadPromise;
  }

  tokenLoadPromise = (async () => {
    let resolvedToken = null;

    if (isWebEnvironment()) {
      const sessionState = getLocalStorageItem("auth-session-state");

      if (sessionState === "logged-out") {
        resolvedToken = null;
      } else {
        resolvedToken = getLocalStorageItem("access");
      }
    } else {
      try {
        resolvedToken = await SecureStore.getItemAsync("access");
      } catch (error) {
        if (__DEV__) {
          console.log("[auth] getStoredToken failed", { message: error?.message });
        }
      }
    }

    cachedAccessToken = resolvedToken;
    return resolvedToken;
  })();

  return tokenLoadPromise;
}

function safeAtob(input) {
  try {
    if (typeof atob === 'function') return atob(input);
    if (typeof globalThis.Buffer !== 'undefined') {
      return globalThis.Buffer.from(input, 'base64').toString('binary');
    }
  } catch (e) {
    return null;
  }
  return null;
}

function parseJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const decoded = safeAtob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    if (!decoded) return null;
    return JSON.parse(decodeURIComponent(escape(decoded)));
  } catch (e) {
    return null;
  }
}

async function getStoredRefresh() {
  if (isWebEnvironment()) {
    return getLocalStorageItem('refresh');
  }
  try {
    return await SecureStore.getItemAsync('refresh');
  } catch (e) {
    return null;
  }
}

async function tryRefreshToken() {
  const refresh = await getStoredRefresh();
  if (!refresh) return false;

  try {
    const resp = await api.post('/token/refresh/', { refresh });
    if (resp?.data?.access) {
      const user = await getStoredUser();
      await persistAuth(resp.data, user || {});
      return true;
    }
  } catch (error) {

  }

  return false;
}

export async function waitForAuthReady() {
  return getStoredToken();
}

export async function getAuthHeaders(token = null) {
  const resolvedToken = token ?? (await getStoredToken());
  return resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {};
}

export async function buildAuthRequestConfig(config = {}) {
  const token = await getStoredToken();
  const authHeaders = await getAuthHeaders(token);
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...authHeaders,
    },
  };
}

export async function clearAuth() {
  cachedAccessToken = null;
  tokenLoadPromise = null;

  if (isWebEnvironment()) {
    removeLocalStorageItem("access");
    removeLocalStorageItem("refresh");
    removeLocalStorageItem("user");
    setLocalStorageItem("auth-session-state", "logged-out");
  } else {
    try {
      await SecureStore.deleteItemAsync("access");
      await SecureStore.deleteItemAsync("refresh");
      await SecureStore.deleteItemAsync("user");
    } catch (error) {
      if (__DEV__) {
        console.log("[auth] clearAuth failed", { message: error?.message });
      }
    }
  }
}

export async function getStoredUser() {
  if (isWebEnvironment()) {
    const user = getLocalStorageItem("user");
    return user ? JSON.parse(user) : null;
  }

  const user = await SecureStore.getItemAsync("user");
  return user ? JSON.parse(user) : null;
}

export function getErrorMessage(error) {
  const data = error?.response?.data;

  if (typeof data === "string") {
    return data;
  }

  if (data?.detail) {
    return data.detail;
  }

  if (data && typeof data === "object") {
    const firstMessage = Object.values(data)
      .flatMap((value) => {
        if (Array.isArray(value)) {
          return value;
        }
        if (typeof value === "string") {
          return [value];
        }
        return [];
      })
      .find(Boolean);

    if (firstMessage) {
      return firstMessage;
    }
  }

  return error?.message || "Request failed. Please try again.";
}
