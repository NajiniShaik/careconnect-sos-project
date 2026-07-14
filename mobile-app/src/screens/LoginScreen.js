import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { api, getErrorMessage, persistAuth } from "../services/authService";
import { getPostLoginRoute } from "../services/navigationService";
import {
  AppButton,
  AppScreen,
  AppTextInput,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../components/common/designSystem";

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
      Alert.alert("Login failed", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen background="brand">
      <PageHeader
        eyebrow="CareConnect"
        title="Welcome back"
        subtitle="Secure sign-in for your community safety portal."
      />

      <SectionCard title="Sign in" subtitle="Use your email and password to continue" style={styles.cardSpacing}>
        <AppTextInput
          label="Email address"
          placeholder="you@example.com"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
        />

        <AppTextInput
          label="Password"
          placeholder="Enter your password"
          value={password}
          secureTextEntry
          onChangeText={(value) => {
            setPassword(value);
            setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={errors.password}
        />

        <AppButton title={loading ? "Signing in..." : "Continue"} onPress={handleLogin} loading={loading} />
        <View style={styles.supportRow}>
          <StatusBadge label="Encrypted access" tone="success" />
        </View>
      </SectionCard>

      <SectionCard title="New to CareConnect?" subtitle="Create your account in a few steps." style={styles.cardSpacing}>
        <AppButton title="Create account" onPress={() => router.push("/register")} variant="secondary" />
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: 14 },
  supportRow: { marginTop: 12, alignItems: "flex-start" },
});