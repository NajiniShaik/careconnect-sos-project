import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api, getErrorMessage, persistAuth } from "../services/authService";
import { getRegistrationRequest } from "../services/registrationService";

const roleOptions = [
  { label: "Resident", value: "RESIDENT" },
  { label: "Guardian", value: "GUARDIAN" },
  { label: "Volunteer", value: "VOLUNTEER" },
  { label: "Security", value: "SECURITY" },
  { label: "Admin", value: "ADMIN" },
];

const initialForm = {
  username: "",
  email: "",
  password: "",
  phone: "",
  role: "RESIDENT",
  resident_name: "",
  relationship: "",
  skills: "",
  availability: "",
  employee_id: "",
  shift: "",
  society: "",
  block: "",
  flat: "",
};

export default function RegisterScreen() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const role = form.role;

  const validation = useMemo(() => {
    const nextErrors = {};

    if (!form.username.trim()) nextErrors.username = "Username is required";
    if (!form.email.trim()) nextErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = "Enter a valid email";
    if (!form.password) nextErrors.password = "Password is required";
    else if (form.password.length < 6) nextErrors.password = "Password must be at least 6 characters";
    if (!form.phone.trim()) nextErrors.phone = "Phone number is required";
    else if (!/^\d{10}$/.test(form.phone)) nextErrors.phone = "Phone must be exactly 10 digits";

    if (role === "GUARDIAN") {
      if (!form.resident_name.trim()) nextErrors.resident_name = "Resident name is required";
      if (!form.relationship.trim()) nextErrors.relationship = "Relationship is required";
    }

    if (role === "VOLUNTEER") {
      if (!form.skills.trim()) nextErrors.skills = "Skills are required";
      if (!form.availability.trim()) nextErrors.availability = "Availability is required";
    }

    if (role === "SECURITY") {
      if (!form.employee_id.trim()) nextErrors.employee_id = "Employee ID is required";
      if (!form.shift.trim()) nextErrors.shift = "Shift is required";
    }

    if (role === "RESIDENT") {
      if (!form.society.trim()) nextErrors.society = "Society is required";
      if (!form.block.trim()) nextErrors.block = "Block is required";
      if (!form.flat.trim()) nextErrors.flat = "Flat is required";
    }

    return nextErrors;
  }, [form, role]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const goNext = () => {
    if (step === 1) {
      const firstStepErrors = {};
      if (!form.username.trim()) firstStepErrors.username = "Username is required";
      if (!form.email.trim()) firstStepErrors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) firstStepErrors.email = "Enter a valid email";
      if (!form.password) firstStepErrors.password = "Password is required";
      else if (form.password.length < 6) firstStepErrors.password = "Password must be at least 6 characters";
      if (!form.phone.trim()) firstStepErrors.phone = "Phone number is required";
      else if (!/^\d{10}$/.test(form.phone)) firstStepErrors.phone = "Phone must be exactly 10 digits";
      setErrors(firstStepErrors);
      if (Object.keys(firstStepErrors).length) return;
      setStep(2);
      return;
    }

    setErrors(validation);
    if (Object.keys(validation).length) return;
    submitRegistration();
  };

  const submitRegistration = async () => {
    setLoading(true);
    try {
      const { endpoint, payload } = getRegistrationRequest(form);
      const res = await api.post(endpoint, payload);
      await persistAuth({ access: res.data.access, refresh: res.data.refresh }, res.data.user);
      Alert.alert("Registration successful", "Your account has been created.");
      if (form.role === "RESIDENT") {
        router.replace("/society-setup");
      } else {
        router.replace("/dashboard");
      }
    } catch (error) {
      Alert.alert("Registration failed", getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>Register as {role.toLowerCase()}</Text>

      <View style={styles.stepRow}>
        <Text style={styles.stepIndicator}>Step {step} of 2</Text>
      </View>

      {step === 1 && (
        <View>
          <Text style={styles.label}>Role</Text>
          {roleOptions.map((option) => (
            <View key={option.value} style={styles.optionRow}>
              <Button title={option.label} onPress={() => updateField("role", option.value)} />
            </View>
          ))}

          <Text style={styles.label}>Username</Text>
          <TextInput style={styles.input} value={form.username} onChangeText={(value) => updateField("username", value)} />
          {errors.username ? <Text style={styles.error}>{errors.username}</Text> : null}

          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={form.email} onChangeText={(value) => updateField("email", value)} keyboardType="email-address" autoCapitalize="none" />
          {errors.email ? <Text style={styles.error}>{errors.email}</Text> : null}

          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={form.password} onChangeText={(value) => updateField("password", value)} secureTextEntry />
          {errors.password ? <Text style={styles.error}>{errors.password}</Text> : null}

          <Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} value={form.phone} onChangeText={(value) => updateField("phone", value)} keyboardType="phone-pad" />
          {errors.phone ? <Text style={styles.error}>{errors.phone}</Text> : null}

          <View style={styles.buttonRow}>
            <Button title="Next" onPress={goNext} />
          </View>
        </View>
      )}

      {step === 2 && (
        <View>
          {role === "GUARDIAN" && (
            <View>
              <Text style={styles.label}>Resident name</Text>
              <TextInput style={styles.input} value={form.resident_name} onChangeText={(value) => updateField("resident_name", value)} />
              {errors.resident_name ? <Text style={styles.error}>{errors.resident_name}</Text> : null}

              <Text style={styles.label}>Relationship</Text>
              <TextInput style={styles.input} value={form.relationship} onChangeText={(value) => updateField("relationship", value)} />
              {errors.relationship ? <Text style={styles.error}>{errors.relationship}</Text> : null}
            </View>
          )}

          {role === "VOLUNTEER" && (
            <View>
              <Text style={styles.label}>Skills</Text>
              <TextInput style={styles.input} value={form.skills} onChangeText={(value) => updateField("skills", value)} />
              {errors.skills ? <Text style={styles.error}>{errors.skills}</Text> : null}

              <Text style={styles.label}>Availability</Text>
              <TextInput style={styles.input} value={form.availability} onChangeText={(value) => updateField("availability", value)} />
              {errors.availability ? <Text style={styles.error}>{errors.availability}</Text> : null}
            </View>
          )}

          {role === "SECURITY" && (
            <View>
              <Text style={styles.label}>Employee ID</Text>
              <TextInput style={styles.input} value={form.employee_id} onChangeText={(value) => updateField("employee_id", value)} />
              {errors.employee_id ? <Text style={styles.error}>{errors.employee_id}</Text> : null}

              <Text style={styles.label}>Shift</Text>
              <TextInput style={styles.input} value={form.shift} onChangeText={(value) => updateField("shift", value)} />
              {errors.shift ? <Text style={styles.error}>{errors.shift}</Text> : null}
            </View>
          )}

          {role === "RESIDENT" && (
            <View>
              <Text style={styles.label}>Society ID</Text>
              <TextInput style={styles.input} value={form.society} onChangeText={(value) => updateField("society", value)} keyboardType="numeric" />
              {errors.society ? <Text style={styles.error}>{errors.society}</Text> : null}

              <Text style={styles.label}>Block ID</Text>
              <TextInput style={styles.input} value={form.block} onChangeText={(value) => updateField("block", value)} keyboardType="numeric" />
              {errors.block ? <Text style={styles.error}>{errors.block}</Text> : null}

              <Text style={styles.label}>Flat ID</Text>
              <TextInput style={styles.input} value={form.flat} onChangeText={(value) => updateField("flat", value)} keyboardType="numeric" />
              {errors.flat ? <Text style={styles.error}>{errors.flat}</Text> : null}
            </View>
          )}

          {role === "ADMIN" && <Text style={styles.helper}>Admin registration will create a basic user account.</Text>}

          <View style={styles.buttonRow}>
            <Button title="Back" onPress={() => setStep(1)} />
            <Button title={loading ? "Creating..." : "Create account"} onPress={goNext} disabled={loading} />
          </View>
          {loading ? <ActivityIndicator style={styles.loader} /> : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 80 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 16, marginBottom: 16, color: "#555" },
  stepRow: { marginBottom: 12 },
  stepIndicator: { color: "#666" },
  label: { fontWeight: "600", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, marginBottom: 4 },
  error: { color: "#d32f2f", marginBottom: 6 },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 10 },
  optionRow: { marginBottom: 8 },
  helper: { color: "#666", marginTop: 8 },
  loader: { marginTop: 12 },
});
