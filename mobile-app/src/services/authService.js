import { create } from "axios";
import Constants from "expo-constants";
import appConfig from "../../app.json";
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
  return appConfig?.expo?.extra?.apiBaseUrl?.trim() || "";
}

function getRuntimeApiBaseUrl() {
  const runtimeBaseUrl =
    globalThis?.process?.env?.EXPO_PUBLIC_API_BASE_URL ||
    globalThis?.process?.env?.API_BASE_URL ||
    "";

  if (runtimeBaseUrl.trim()) {
    if (__DEV__) {
      console.log("[api] using env API_BASE_URL", { runtimeBaseUrl });
    }
    return runtimeBaseUrl.trim();
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
    if (__DEV__) {
      console.log("[api] resolved apiBaseUrl from Expo constants", {
        appJsonApiBaseUrl: getDefaultApiBaseUrl(),
        configBaseUrl,
        finalUrl,
      });
    }
    return finalUrl;
  } catch (error) {
    if (__DEV__) {
      console.log("[api] failed to resolve apiBaseUrl", { error: error?.message });
    }
    return getDefaultApiBaseUrl();
  }
}

export function getApiBaseUrl() {
  const baseUrl = getRuntimeApiBaseUrl();
  if (__DEV__) {
    console.log("[api] getApiBaseUrl ->", { baseUrl });
  }
  return baseUrl;
}

export const API_BASE_URL = getApiBaseUrl();

export const api = create({
  baseURL: API_BASE_URL || undefined,
  timeout: 15000,
});

if (__DEV__) {
  console.log("[api] axios baseURL configured", { API_BASE_URL });
}

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

  console.log("[auth] persistAuth called", { accessToken: Boolean(accessToken), hasRefreshToken: Boolean(refreshToken), user: user?.username || user?.id });

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

  console.log("[auth] token successfully stored", { hasToken: Boolean(accessToken), tokenLength: accessToken?.length || 0 });

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
    console.log("[auth] getStoredToken returning cached token", { hasToken: Boolean(cachedAccessToken), tokenLength: cachedAccessToken?.length || 0 });
    return cachedAccessToken;
  }

  if (tokenLoadPromise) {
    console.log("[auth] getStoredToken returning pending token promise");
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

    console.log("[auth] getStoredToken result", {
      hasToken: Boolean(resolvedToken),
      tokenLength: resolvedToken?.length || 0,
      cacheMiss: resolvedToken !== cachedAccessToken,
    });

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

function safeAtob(input) {
  try {
    if (typeof atob === 'function') return atob(input);
    if (typeof Buffer !== 'undefined') return Buffer.from(input, 'base64').toString('binary');
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
    if (__DEV__) {
      console.log('[auth] refresh failed', error?.response?.status, error?.response?.data);
    }
  }

  return false;
}

export async function getAuthHeaders(token = null) {
  const resolvedToken = token ?? (await getStoredToken());
  return resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {};
}

export async function buildAuthRequestConfig(config = {}) {
  // ensure token is valid; if expired try to refresh
  const token = await getStoredToken();
  const payload = token ? parseJwt(token) : null;
  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && payload.exp <= now) {
    if (__DEV__) console.log('[auth] access token expired, attempting refresh');
    await tryRefreshToken();
  }

  const freshToken = await getStoredToken();
  const authHeaders = await getAuthHeaders(freshToken);
  console.log("[auth] Authorization header before request", { Authorization: authHeaders.Authorization || null });
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
