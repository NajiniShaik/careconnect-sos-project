import React, { useState } from "react";
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api, getErrorMessage, persistAuth } from "../services/authService";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setLoading(true);
    try {
      const res = await api.post("/users/login/", { email, password });
      await persistAuth({ access: res.data.access, refresh: res.data.refresh }, res.data.user);
      const role = res.data?.user?.role;
      if (role === "RESIDENT") {
        router.replace("/society-setup");
      } else {
        router.replace("/dashboard");
      }
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
        onChangeText={setEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        placeholder="Password"
        value={password}
        secureTextEntry
        onChangeText={setPassword}
        style={styles.input}
      />

      <Button title={loading ? "Signing in..." : "Login"} onPress={handleLogin} disabled={loading} />
      {loading ? <ActivityIndicator style={styles.loader} /> : null}

      <View style={styles.linkRow}>
        <Text>New here?</Text>
        <Button title="Create account" onPress={() => router.push("/register")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, marginTop: 100 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 6 },
  subtitle: { fontSize: 16, marginBottom: 16, color: "#666" },
  input: { borderWidth: 1, marginBottom: 10, padding: 10, borderRadius: 8 },
  loader: { marginTop: 12 },
  linkRow: { marginTop: 20, alignItems: "center" },
});