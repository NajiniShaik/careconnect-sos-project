import { create } from "axios";

const isWeb = typeof document !== "undefined" && typeof window !== "undefined";

export const API_BASE_URL = isWeb
  ? "http://127.0.0.1:8000/api"
  : "http://10.0.2.2:8000/api";

export const api = create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

async function getSecureStore() {
  const { default: SecureStore } = await import("expo-secure-store");
  return SecureStore;
}

export async function persistAuth(tokens, user) {
  if (isWeb) {
    localStorage.setItem("access", tokens.access);
    localStorage.setItem("refresh", tokens.refresh);
    localStorage.setItem("user", JSON.stringify(user));
  } else {
    const SecureStore = await getSecureStore();
    await SecureStore.setItemAsync("access", tokens.access);
    await SecureStore.setItemAsync("refresh", tokens.refresh);
    await SecureStore.setItemAsync("user", JSON.stringify(user));
  }
}

export async function getStoredToken() {
  if (isWeb) {
    return localStorage.getItem("access");
  }

  const SecureStore = await getSecureStore();
  return SecureStore.getItemAsync("access");
}

export async function getAuthHeaders(token = null) {
  const resolvedToken = token || (await getStoredToken());
  return resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {};
}

export async function clearAuth() {
  if (isWeb) {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
  } else {
    const SecureStore = await getSecureStore();
    await SecureStore.deleteItemAsync("access");
    await SecureStore.deleteItemAsync("refresh");
    await SecureStore.deleteItemAsync("user");
  }
}

export async function getStoredUser() {
  if (isWeb) {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  }

  const SecureStore = await getSecureStore();
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
