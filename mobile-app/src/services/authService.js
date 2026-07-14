import { create } from "axios";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

let cachedAccessToken = null;
let tokenLoadPromise = null;

function isWebEnvironment() {
  return (
    (typeof document !== "undefined" && typeof window !== "undefined") ||
    (typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined")
  );
}

function getDefaultApiBaseUrl() {
  return "";
}

function getRuntimeApiBaseUrl() {
  const runtimeBaseUrl =
    globalThis?.process?.env?.EXPO_PUBLIC_API_BASE_URL ||
    globalThis?.process?.env?.API_BASE_URL ||
    "";

  if (runtimeBaseUrl.trim()) {
    return runtimeBaseUrl.trim();
  }

  try {
    const configBaseUrl =
      Constants?.expoConfig?.extra?.apiBaseUrl ||
      Constants?.manifest2?.extra?.apiBaseUrl ||
      "";

    return configBaseUrl.trim() || getDefaultApiBaseUrl();
  } catch {
    return getDefaultApiBaseUrl();
  }
}

export function getApiBaseUrl() {
  return getRuntimeApiBaseUrl();
}

export const API_BASE_URL = getApiBaseUrl();

export const api = create({
  baseURL: API_BASE_URL || undefined,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  // Skip auth headers for login and register endpoints
  const url = config.url || "";
  const isAuthEndpoint = url.includes("/login/") || url.includes("/register/");
  
  if (isAuthEndpoint) {
    if (__DEV__) {
      console.log("[auth] request (no auth header)", {
        method: config.method?.toUpperCase(),
        url: config.url,
      });
    }
    return config;
  }

  const requestConfig = await buildAuthRequestConfig(config);

  if (__DEV__) {
    console.log("[auth] request", {
      method: requestConfig.method?.toUpperCase(),
      url: requestConfig.url,
      hasAuth: Boolean(requestConfig.headers?.Authorization),
    });
  }

  return requestConfig;
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

  if (__DEV__) {
    console.log("[auth] persist token", {
      source: isWebEnvironment() ? "localStorage" : "secure-store",
      hasToken: Boolean(accessToken),
      tokenLength: accessToken?.length || 0,
    });
  }
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

    if (__DEV__) {
      console.log("[auth] getStoredToken", {
        hasToken: Boolean(resolvedToken),
        tokenLength: resolvedToken?.length || 0,
      });
    }

    return resolvedToken;
  })();

  return tokenLoadPromise;
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
  if (__DEV__) {
    console.log("[auth] clearAuth called, clearing all auth state...");
  }
  
  cachedAccessToken = null;
  tokenLoadPromise = null;

  if (isWebEnvironment()) {
    if (__DEV__) {
      console.log("[auth] Clearing web environment storage...");
    }
    globalThis.localStorage.removeItem("access");
    globalThis.localStorage.removeItem("refresh");
    globalThis.localStorage.removeItem("user");
    globalThis.localStorage.setItem("auth-session-state", "logged-out");
  } else {
    try {
      if (__DEV__) {
        console.log("[auth] Clearing SecureStore...");
      }
      await SecureStore.deleteItemAsync("access");
      await SecureStore.deleteItemAsync("refresh");
      await SecureStore.deleteItemAsync("user");
    } catch (error) {
      if (__DEV__) {
        console.log("[auth] clearAuth failed", { message: error?.message });
      }
    }
  }
  
  if (__DEV__) {
    console.log("[auth] clearAuth completed");
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
