import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import SearchableDropdown from "../components/common/SearchableDropdown";
import {
  AppButton,
  AppIcon,
  AppScreen,
  AppTextInput,
  PageHeader,
  SectionCard,
  StatusBadge,
  appColors,
} from "../components/common/designSystem";
import { api, getAuthHeaders, getErrorMessage, getStoredToken, persistAuth } from "../services/authService";
import { getRegistrationRequest } from "../services/registrationService";

const roleOptions = [
  { label: "Resident", value: "RESIDENT", icon: "home-outline", description: "Join your society and manage safety access." },
  { label: "Guardian", value: "GUARDIAN", icon: "people-outline", description: "Support a resident with emergency updates." },
  { label: "Volunteer", value: "VOLUNTEER", icon: "hand-left-outline", description: "Offer support during local incidents." },
  { label: "Security", value: "SECURITY", icon: "shield-outline", description: "Coordinate emergency response." },
  { label: "Admin", value: "ADMIN", icon: "settings-outline", description: "Manage community access and operations." },
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
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [errors, setErrors] = useState({});
  const [societies, setSocieties] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [flats, setFlats] = useState([]);

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

  useEffect(() => {
    const loadLookups = async () => {
      if (role !== "RESIDENT") return;

      setLoadingLookups(true);
      try {
        const token = await getStoredToken();
        const authHeaders = await getAuthHeaders(token);
        const [societiesRes, blocksRes, flatsRes] = await Promise.all([
          api.get("/society/societies/", { headers: authHeaders }),
          api.get("/society/blocks/", { headers: authHeaders }),
          api.get("/society/flats/", { headers: authHeaders }),
        ]);
        setSocieties(societiesRes.data || []);
        setBlocks(blocksRes.data || []);
        setFlats(flatsRes.data || []);
      } catch (error) {
        Alert.alert("Lookup failed", getErrorMessage(error));
      } finally {
        setLoadingLookups(false);
      }
    };

    void loadLookups();
  }, [role]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSocietySelect = (item) => {
    updateField("society", String(item.id));
    updateField("block", "");
    updateField("flat", "");
  };

  const handleBlockSelect = (item) => {
    updateField("block", String(item.id));
    updateField("flat", "");
  };

  const handleFlatSelect = (item) => {
    updateField("flat", String(item.id));
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
      const user = res.data?.user;
      const residentSetupComplete = form.role === "RESIDENT" ? Boolean(form.society && form.block && form.flat) : true;
      const residentProfile = form.role === "RESIDENT"
        ? {
            society: form.society,
            block: form.block,
            flat: form.flat,
            residentSetupComplete,
          }
        : { residentSetupComplete };
      await persistAuth({ access: res.data.access, refresh: res.data.refresh }, { ...user, ...residentProfile });
      Alert.alert("Registration successful", "Your account has been created.");
      router.replace("/dashboard");
    } catch (error) {
      Alert.alert("Registration failed", getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Create profile"
        title="Join CareConnect"
        subtitle="Register your account and complete your emergency profile."
      />

      <SectionCard title={`Step ${step} of 2`} subtitle={role.toLowerCase()} style={styles.cardSpacing}>
        <View style={styles.stepBar}>
          <View style={[styles.stepPill, step === 1 ? styles.stepPillActive : null]}>
            <Text style={[styles.stepPillText, step === 1 ? styles.stepPillTextActive : null]}>Basic details</Text>
          </View>
          <View style={[styles.stepPill, step === 2 ? styles.stepPillActive : null]}>
            <Text style={[styles.stepPillText, step === 2 ? styles.stepPillTextActive : null]}>Profile details</Text>
          </View>
        </View>
      </SectionCard>

      {step === 1 && (
        <SectionCard title="Choose your role" subtitle="Select the role that best describes you" style={styles.cardSpacing}>
          <View style={styles.roleGrid}>
            {roleOptions.map((option) => {
              const selected = form.role === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.roleCard, selected && styles.roleCardSelected]}
                  onPress={() => updateField("role", option.value)}
                >
                  <AppIcon name={option.icon} size={20} color={selected ? appColors.blue : appColors.slate} />
                  <Text style={[styles.roleTitle, selected && styles.roleTitleSelected]}>{option.label}</Text>
                  <Text style={styles.roleDescription}>{option.description}</Text>
                </Pressable>
              );
            })}
          </View>

          <AppTextInput label="Username" placeholder="Enter a username" value={form.username} onChangeText={(value) => updateField("username", value)} error={errors.username} />
          <AppTextInput label="Email" placeholder="you@example.com" value={form.email} onChangeText={(value) => updateField("email", value)} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
          <AppTextInput label="Password" placeholder="Minimum 6 characters" value={form.password} onChangeText={(value) => updateField("password", value)} secureTextEntry error={errors.password} />
          <AppTextInput label="Phone" placeholder="10-digit contact number" value={form.phone} onChangeText={(value) => updateField("phone", value)} keyboardType="phone-pad" error={errors.phone} />

          <AppButton title="Continue" onPress={goNext} />
        </SectionCard>
      )}

      {step === 2 && (
        <SectionCard title="Complete your profile" subtitle="Add the details required for your role" style={styles.cardSpacing}>
          {role === "GUARDIAN" && (
            <View>
              <AppTextInput label="Resident name" placeholder="Name of the resident" value={form.resident_name} onChangeText={(value) => updateField("resident_name", value)} error={errors.resident_name} />
              <AppTextInput label="Relationship" placeholder="Parent / Spouse / Friend" value={form.relationship} onChangeText={(value) => updateField("relationship", value)} error={errors.relationship} />
            </View>
          )}

          {role === "VOLUNTEER" && (
            <View>
              <AppTextInput label="Skills" placeholder="First aid, transport, etc." value={form.skills} onChangeText={(value) => updateField("skills", value)} error={errors.skills} />
              <AppTextInput label="Availability" placeholder="Weekdays evenings" value={form.availability} onChangeText={(value) => updateField("availability", value)} error={errors.availability} />
            </View>
          )}

          {role === "SECURITY" && (
            <View>
              <AppTextInput label="Employee ID" placeholder="Enter employee ID" value={form.employee_id} onChangeText={(value) => updateField("employee_id", value)} error={errors.employee_id} />
              <AppTextInput label="Shift" placeholder="Morning / Evening / Night" value={form.shift} onChangeText={(value) => updateField("shift", value)} error={errors.shift} />
            </View>
          )}

          {role === "RESIDENT" && (
            <View>
              {loadingLookups ? (
                <ActivityIndicator style={styles.loader} />
              ) : (
                <>
                  <SearchableDropdown
                    label="Society"
                    placeholder="Select society"
                    value={form.society}
                    options={societies}
                    onSelect={handleSocietySelect}
                    getLabel={(item) => item.name}
                    getValue={(item) => item.id}
                    emptyText="No societies found"
                  />
                  {errors.society ? <Text style={styles.error}>{errors.society}</Text> : null}

                  <SearchableDropdown
                    label="Block / Tower"
                    placeholder="Select block"
                    value={form.block}
                    options={blocks.filter((item) => String(item.society) === String(form.society))}
                    onSelect={handleBlockSelect}
                    getLabel={(item) => item.name}
                    getValue={(item) => item.id}
                    disabled={!form.society}
                    emptyText="No blocks found for the selected society"
                  />
                  {errors.block ? <Text style={styles.error}>{errors.block}</Text> : null}

                  <SearchableDropdown
                    label="Flat"
                    placeholder="Select flat"
                    value={form.flat}
                    options={flats.filter((item) => String(item.block) === String(form.block) && !item.is_occupied)}
                    onSelect={handleFlatSelect}
                    getLabel={(item) => item.flat_number}
                    getValue={(item) => item.id}
                    disabled={!form.block}
                    emptyText="No available flats found for the selected block"
                  />
                  {errors.flat ? <Text style={styles.error}>{errors.flat}</Text> : null}
                </>
              )}
            </View>
          )}

          {role === "ADMIN" && <StatusBadge label="Admin registration creates a basic account" tone="warning" />}

          <View style={styles.buttonRow}>
            <AppButton title="Back" onPress={() => setStep(1)} variant="secondary" style={styles.backButton} />
            <AppButton title={loading ? "Creating..." : "Create account"} onPress={goNext} loading={loading} />
          </View>
        </SectionCard>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: 14 },
  stepBar: { flexDirection: "row", gap: 8 },
  stepPill: { flex: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#eff6ff", alignItems: "center" },
  stepPillActive: { backgroundColor: appColors.blue },
  stepPillText: { color: appColors.blue, fontSize: 13, fontWeight: "700" },
  stepPillTextActive: { color: appColors.white },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  roleCard: { width: "48%", borderWidth: 1, borderColor: appColors.border, borderRadius: 16, padding: 12, backgroundColor: appColors.white, marginBottom: 10 },
  roleCardSelected: { borderColor: appColors.blue, backgroundColor: "#eff6ff" },
  roleTitle: { marginTop: 8, color: appColors.navy, fontWeight: "700" },
  roleTitleSelected: { color: appColors.blue },
  roleDescription: { marginTop: 4, color: appColors.muted, fontSize: 12, lineHeight: 18 },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  backButton: { flex: 0.45, marginRight: 10 },
  loader: { marginTop: 12 },
  error: { color: appColors.red, marginTop: 6, fontSize: 12 },
});
