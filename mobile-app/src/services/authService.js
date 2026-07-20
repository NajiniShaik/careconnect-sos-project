import { create } from "axios";
import Constants from "expo-constants";
import appConfig from "../../app.json";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";


function isWebEnvironment() { 
  return Platform.OS === "web";
}

let cachedAccessToken = null;
let tokenLoadPromise = null;

function getDefaultApiBaseUrl() {
  return appConfig?.expo?.extra?.apiBaseUrl?.trim() || "";
}

function getRuntimeApiBaseUrl() {
  const runtimeBaseUrl =
    globalThis?.process?.env?.EXPO_PUBLIC_API_BASE_URL ||
    globalThis?.process?.env?.API_BASE_URL ||
    "";

  if (runtimeBaseUrl.trim()) {
    return runtimeBaseUrl.trim();
  }

  if (isWebEnvironment()) {
    return "http://127.0.0.1:8000/api";
  }

  try {
    const configBaseUrl =
      Constants?.expoConfig?.extra?.apiBaseUrl ||
      Constants?.manifest2?.extra?.apiBaseUrl ||
      Constants?.manifest?.extra?.apiBaseUrl ||
      "";
    const finalUrl =
      getDefaultApiBaseUrl() ||
      configBaseUrl.trim() ||
      "";
    return finalUrl;
  } catch (error) {
    return getDefaultApiBaseUrl();
  }
}

export function getApiBaseUrl() {
  return getRuntimeApiBaseUrl();
}

export const API_BASE_URL = getApiBaseUrl();

console.log("Platform:", Platform.OS);
console.log("API:", API_BASE_URL);

export const api = create({
  baseURL: API_BASE_URL || undefined,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  // Skip auth headers for login and register endpoints
  const url = config.url || "";
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
    globalThis.localStorage.setItem("access", accessToken || "");
    globalThis.localStorage.setItem("refresh", refreshToken || "");
    globalThis.localStorage.setItem("user", JSON.stringify(user));
    globalThis.localStorage.setItem("auth-session-state", "logged-in");
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
      const sessionState = typeof globalThis.localStorage !== "undefined"
        ? globalThis.localStorage.getItem("auth-session-state")
        : null;

      if (sessionState === "logged-out") {
        resolvedToken = null;
      } else {
        resolvedToken = typeof globalThis.localStorage !== "undefined"
          ? globalThis.localStorage.getItem("access")
          : null;
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
    return globalThis.localStorage.getItem('refresh');
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
      await persistAuth(resp.data, JSON.parse(globalThis.localStorage.getItem('user') || '{}'));
      return true;
    }
  } catch (error) {

  }

  return false;
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
    globalThis.localStorage.removeItem("access");
    globalThis.localStorage.removeItem("refresh");
    globalThis.localStorage.removeItem("user");
    globalThis.localStorage.setItem("auth-session-state", "logged-out");
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
    const user =
      typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage.getItem("user") : null;
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
