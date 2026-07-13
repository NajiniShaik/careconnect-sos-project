import React, { useState } from "react";
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api, getErrorMessage, persistAuth } from "../services/authService";
import { getPostLoginRoute } from "../services/navigationService";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const router = useRouter();

  const validateForm = () => {
    const nextErrors = {};

    if (!email.trim()) {
      nextErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Enter a valid email";
    }

    if (!password) {
      nextErrors.password = "Password is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const res = await api.post("/users/login/", { email, password });
      const user = res.data?.user;
      const residentSetupComplete = Boolean(user?.society && user?.block && user?.flat);
      const residentProfile = user?.role === "RESIDENT"
        ? {
            society: user?.society || "",
            block: user?.block || "",
            flat: user?.flat || "",
            residentSetupComplete,
          }
        : { residentSetupComplete };
      await persistAuth({ access: res.data.access, refresh: res.data.refresh }, { ...user, ...residentProfile });
      router.replace(getPostLoginRoute(user, { ...residentProfile }));
    } catch (err) {
      console.log(err.response?.data || err.message);
      alert(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to your account</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setErrors((prev) => ({ ...prev, email: undefined }));
        }}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {errors.email ? <Text style={styles.error}>{errors.email}</Text> : null}

      <TextInput
        placeholder="Password"
        value={password}
        secureTextEntry
        onChangeText={(value) => {
          setPassword(value);
          setErrors((prev) => ({ ...prev, password: undefined }));
        }}
        style={styles.input}
      />
      {errors.password ? <Text style={styles.error}>{errors.password}</Text> : null}

      <View style={styles.buttonWrapper}>
        <Button title={loading ? "Signing in..." : "Login"} onPress={handleLogin} disabled={loading} />
      </View>
      {loading ? <ActivityIndicator style={styles.loader} /> : null}

      <View style={styles.linkRow}>
        <Text style={styles.linkText}>New here?</Text>
        <View style={styles.secondaryButton}>
          <Button title="Create account" onPress={() => router.push("/register")} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 80, paddingBottom: 24, flex: 1, justifyContent: "center", backgroundColor: "#f8fafc" },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 8, color: "#111" },
  subtitle: { fontSize: 16, marginBottom: 20, color: "#555" },
  input: { borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#fff", marginBottom: 10, padding: 12, borderRadius: 12, color: "#111" },
  error: { color: "#d32f2f", marginBottom: 10 },
  loader: { marginTop: 14 },
  linkRow: { marginTop: 24, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  linkText: { color: "#444", marginRight: 8 },
  buttonWrapper: { borderRadius: 12, overflow: "hidden", marginTop: 16 },
  secondaryButton: { borderRadius: 12, overflow: "hidden" },
});