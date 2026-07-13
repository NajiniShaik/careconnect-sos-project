import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { api, getErrorMessage, getStoredToken, getStoredUser } from "../services/authService";
import { buildResidentProfileViewModel } from "../services/residentProfileService";

export default function ResidentProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [contactForm, setContactForm] = useState({
    name: "",
    phone: "",
    relationship: "",
    contact_type: "EMERGENCY",
  });
  const [editingContactId, setEditingContactId] = useState(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactFormError, setContactFormError] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [resendingContactId, setResendingContactId] = useState(null);

  const loadProfile = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError("");

    try {
      const token = await getStoredToken();
      const storedUser = await getStoredUser();

      const residentRes = await api.get("/users/resident-profiles/", {
        headers: { Authorization: `Bearer ${token}` },
      }).catch((err) => {
        if (err?.response?.status === 403 || err?.response?.status === 401) {
          return { data: [] };
        }
        throw err;
      });

      const contactsRes = await api.get("/users/emergency-contacts/", {
        headers: { Authorization: `Bearer ${token}` },
      }).catch((err) => {
        if (err?.response?.status === 403 || err?.response?.status === 401) {
          return { data: [] };
        }
        throw err;
      });

      const residentList = Array.isArray(residentRes?.data) ? residentRes.data : [];
      const residentProfile = residentList[0] || null;
      const emergencyContacts = Array.isArray(contactsRes?.data) ? contactsRes.data : [];
      const viewModel = buildResidentProfileViewModel(storedUser, residentProfile, emergencyContacts);

      setProfile(viewModel);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (!isRefresh) setLoading(false);
      setRefreshing(false);
      setContactSaving(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const runLoad = async () => {
      if (mounted) {
        await loadProfile();
      }
    };

    void runLoad();

    return () => {
      mounted = false;
    };
  }, [loadProfile]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProfile(true);
  }, [loadProfile]);

  const resetContactForm = () => {
    setEditingContactId(null);
    setContactForm({ name: "", phone: "", relationship: "", contact_type: "EMERGENCY" });
    setContactFormError("");
  };

  const startEditContact = (contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name || "",
      phone: contact.phone || "",
      relationship: contact.relationship || "",
      contact_type: contact.contact_type || "EMERGENCY",
    });
    setContactFormError("");
  };

  const handleContactSubmit = async () => {
    if (!contactForm.name.trim() || !contactForm.phone.trim() || !contactForm.relationship.trim()) {
      setContactFormError("Name, phone, and relationship are required.");
      return;
    }

    setContactSaving(true);
    setContactFormError("");

    try {
      const token = await getStoredToken();
      const payload = {
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim(),
        relationship: contactForm.relationship.trim(),
        contact_type: contactForm.contact_type.trim() || "EMERGENCY",
      };

      if (editingContactId) {
        await api.patch(`/users/emergency-contacts/${editingContactId}/`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await api.post("/users/emergency-contacts/", payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      resetContactForm();
      Alert.alert("Saved", "Emergency contact updated successfully.");
      loadProfile(true);
    } catch (err) {
      setContactFormError(getErrorMessage(err));
      setContactSaving(false);
    }
  };

  const handleDeleteContact = async (contactId) => {
    try {
      const token = await getStoredToken();
      await api.delete(`/users/emergency-contacts/${contactId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      Alert.alert("Removed", "Emergency contact removed.");
      loadProfile(true);
    } catch (err) {
      Alert.alert("Delete failed", getErrorMessage(err));
    }
  };

  const handleResendVerification = async (contactId) => {
    setVerificationError("");
    setResendingContactId(contactId);

    try {
      const token = await getStoredToken();
      await api.patch(`/users/emergency-contacts/${contactId}/verify_contact/`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      Alert.alert("Verification sent", "The contact verification request was sent successfully.");
      loadProfile(true);
    } catch (err) {
      setVerificationError(getErrorMessage(err));
      Alert.alert("Verification failed", getErrorMessage(err));
    } finally {
      setResendingContactId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.helper}>Loading your resident profile…</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || "No resident profile found."}</Text>
        <Button title="Retry" onPress={() => loadProfile()} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Resident profile</Text>
      <Text style={styles.subtitle}>Your account, address, and emergency contacts</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personal details</Text>
        <DetailRow label="Name" value={profile.username} />
        <DetailRow label="Role" value={profile.role} />
        <DetailRow label="Phone" value={profile.phone} />
        <DetailRow label="Email" value={profile.email} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Residence</Text>
        <DetailRow label="Society" value={profile.society} />
        <DetailRow label="Block / Tower" value={profile.block} />
        <DetailRow label="Flat" value={profile.flat} />
        <DetailRow label="Approval status" value={profile.approvalStatus} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Emergency contacts</Text>
        {profile.emergencyContacts.length === 0 ? (
          <Text style={styles.helper}>No emergency contacts have been added yet.</Text>
        ) : (
          profile.emergencyContacts.map((contact) => (
            <View key={contact.id || `${contact.name}-${contact.phone}`} style={styles.contactItem}>
              <Text style={styles.contactName}>{contact.name || "Contact"}</Text>
              <Text style={styles.helper}>{contact.relationship || "Relationship not provided"}</Text>
              <Text style={styles.helper}>{contact.phone || "Phone not provided"}</Text>
              <View style={[styles.badge, styles[`badge${contact.verificationState === "verified" ? "Success" : contact.verificationState === "failed" ? "Danger" : "Warning"}`]]}>
                <Text style={styles.badgeText}>{contact.verificationLabel}</Text>
              </View>
              {verificationError ? <Text style={styles.error}>{verificationError}</Text> : null}
              <View style={styles.contactActions}>
                <Button title={resendingContactId === contact.id ? "Sending..." : "Resend"} onPress={() => handleResendVerification(contact.id)} disabled={resendingContactId === contact.id} />
                <Button title="Edit" onPress={() => startEditContact(contact)} />
                <Button title="Remove" onPress={() => handleDeleteContact(contact.id)} />
              </View>
            </View>
          ))
        )}

        <View style={styles.inputRow}>
          <Text style={styles.label}>{editingContactId ? "Edit contact" : "Add contact"}</Text>
          <TextInput
            style={styles.input}
            placeholder="Contact name"
            value={contactForm.name}
            onChangeText={(value) => setContactForm((prev) => ({ ...prev, name: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone"
            value={contactForm.phone}
            onChangeText={(value) => setContactForm((prev) => ({ ...prev, phone: value }))}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Relationship"
            value={contactForm.relationship}
            onChangeText={(value) => setContactForm((prev) => ({ ...prev, relationship: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Contact type"
            value={contactForm.contact_type}
            onChangeText={(value) => setContactForm((prev) => ({ ...prev, contact_type: value }))}
          />
          {contactFormError ? <Text style={styles.error}>{contactFormError}</Text> : null}
          <View style={styles.contactActions}>
            <Button title={contactSaving ? "Saving..." : editingContactId ? "Save changes" : "Add contact"} onPress={handleContactSubmit} disabled={contactSaving} />
            {editingContactId ? <Button title="Cancel" onPress={resetContactForm} /> : null}
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account details</Text>
        <Text style={styles.helper}>Phone and email are shown from the current session, but they are not editable through the backend endpoints available in this project.</Text>
      </View>

      <View style={styles.card}>
        <Button title="Back to dashboard" onPress={() => router.replace("/dashboard")} />
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || "Not available"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 80 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 16 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 14, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTitle: { fontSize: 17, fontWeight: "700", marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, gap: 8 },
  rowLabel: { fontWeight: "600", color: "#444" },
  rowValue: { flex: 1, textAlign: "right", color: "#222" },
  helper: { color: "#666", marginTop: 6 },
  error: { color: "#d32f2f", marginTop: 6 },
  inputRow: { marginTop: 8 },
  label: { fontWeight: "600", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, marginBottom: 8 },
  contactItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  contactName: { fontWeight: "600" },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  badgeWarning: { backgroundColor: "#fff4d6" },
  badgeSuccess: { backgroundColor: "#e8f5e9" },
  badgeDanger: { backgroundColor: "#fdecea" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  contactActions: { flexDirection: "row", gap: 8, marginTop: 8, justifyContent: "flex-start" },
});
