import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "axios";

export const API_BASE_URL = Platform.select({
  web: "http://127.0.0.1:8000/api",
  default: "http://10.0.2.2:8000/api",
});

export const api = create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export async function persistAuth(tokens, user) {
  if (Platform.OS === "web") {
    localStorage.setItem("access", tokens.access);
    localStorage.setItem("refresh", tokens.refresh);
    localStorage.setItem("user", JSON.stringify(user));
  } else {
    await SecureStore.setItemAsync("access", tokens.access);
    await SecureStore.setItemAsync("refresh", tokens.refresh);
    await SecureStore.setItemAsync("user", JSON.stringify(user));
  }
}

export async function getStoredToken() {
  if (Platform.OS === "web") {
    return localStorage.getItem("access");
  }
  return SecureStore.getItemAsync("access");
}

export async function clearAuth() {
  if (Platform.OS === "web") {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
  } else {
    await SecureStore.deleteItemAsync("access");
    await SecureStore.deleteItemAsync("refresh");
    await SecureStore.deleteItemAsync("user");
  }
}

export async function getStoredUser() {
  if (Platform.OS === "web") {
    const user = localStorage.getItem("user");
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
