import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppButton,
  AppScreen,
  AppTextInput,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  appColors,
} from "../components/common/designSystem";
import { api, getAuthHeaders, getErrorMessage, getStoredToken, getStoredUser } from "../services/authService";
import { buildResidentProfileViewModel } from "../services/residentProfileService";

export default function ResidentProfileScreen({
  pageTitle = "Resident profile",
  pageSubtitle = "Keep your address, account details, and contacts up to date.",
  showProfile = true,
  showContactManager = true,
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
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
      const authHeaders = await getAuthHeaders(token);
      const storedUser = await getStoredUser();

      const residentRes = await api.get("/users/resident-profiles/", {
        headers: authHeaders,
      }).catch((err) => {
        if (err?.response?.status === 403 || err?.response?.status === 401) {
          return { data: [] };
        }
        throw err;
      });

      const contactsRes = await api.get("/users/emergency-contacts/", {
        headers: authHeaders,
      }).catch((err) => {
        if (err?.response?.status === 403 || err?.response?.status === 401) {
          return { data: [] };
        }
        throw err;
      });

      const residentList = Array.isArray(residentRes?.data) ? residentRes.data : [];
      const residentProfile = residentList.find((item) => String(item?.user?.id || item?.user_id || item?.id) === String(storedUser?.id)) || residentList[0] || null;
      const emergencyContacts = Array.isArray(contactsRes?.data) ? contactsRes.data : [];
      const viewModel = buildResidentProfileViewModel(storedUser, residentProfile, emergencyContacts);

      setProfile(viewModel);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (!isRefresh) setLoading(false);
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
      const authHeaders = await getAuthHeaders(token);
      const payload = {
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim(),
        relationship: contactForm.relationship.trim(),
        contact_type: contactForm.contact_type.trim() || "EMERGENCY",
      };

      if (editingContactId) {
        await api.patch(`/users/emergency-contacts/${editingContactId}/`, payload, {
          headers: authHeaders,
        });
      } else {
        await api.post("/users/emergency-contacts/", payload, {
          headers: authHeaders,
        });
      }

      resetContactForm();
      Alert.alert("Saved", "Emergency contact updated successfully.");
      await loadProfile(true);
    } catch (err) {
      setContactFormError(getErrorMessage(err));
      setContactSaving(false);
    }
  };

  const handleDeleteContact = async (contactId) => {
    try {
      const token = await getStoredToken();
      const authHeaders = await getAuthHeaders(token);
      await api.delete(`/users/emergency-contacts/${contactId}/`, {
        headers: authHeaders,
      });
      Alert.alert("Removed", "Emergency contact removed.");
      await loadProfile(true);
    } catch (err) {
      Alert.alert("Delete failed", getErrorMessage(err));
    }
  };

  const handleMarkPrimary = async (contact) => {
    try {
      const token = await getStoredToken();
      const authHeaders = await getAuthHeaders(token);
      await api.patch(`/users/emergency-contacts/${contact.id}/`, {
        contact_type: "PRIMARY_GUARDIAN",
      }, {
        headers: authHeaders,
      });
      Alert.alert("Updated", `${contact.name} is now the primary contact.`);
      await loadProfile(true);
    } catch (err) {
      Alert.alert("Update failed", getErrorMessage(err));
    }
  };

  const handleResendVerification = async (contactId) => {
    setVerificationError("");
    setResendingContactId(contactId);

    try {
      const token = await getStoredToken();
      const authHeaders = await getAuthHeaders(token);
      await api.patch(`/users/emergency-contacts/${contactId}/verify_contact/`, {}, {
        headers: authHeaders,
      });
      Alert.alert("Verification sent", "The contact verification request was sent successfully.");
      await loadProfile(true);
    } catch (err) {
      setVerificationError(getErrorMessage(err));
      Alert.alert("Verification failed", getErrorMessage(err));
    } finally {
      setResendingContactId(null);
    }
  };

  if (loading) {
    return (
      <AppScreen>
        <PageHeader eyebrow="Resident profile" title="Loading your profile" subtitle="Please wait while your details are fetched." />
        <SectionCard title="Preparing your profile" subtitle="This should only take a moment." style={styles.loadingCard}>
          <ActivityIndicator size="large" color={appColors.blue} />
          <Text style={styles.helper}>Loading your resident profile…</Text>
        </SectionCard>
      </AppScreen>
    );
  }

  if (!profile) {
    return (
      <AppScreen>
        <PageHeader eyebrow="Resident profile" title="No resident profile" subtitle="We could not find an active profile for this account." />
        <SectionCard title="Profile unavailable" subtitle="Check your connection and try again." style={styles.loadingCard}>
          <Text style={styles.error}>{error || "No resident profile found."}</Text>
          <AppButton title="Retry" onPress={() => loadProfile()} style={styles.retryButton} />
        </SectionCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow={pageTitle}
        title={pageTitle}
        subtitle={pageSubtitle}
        action={<StatusBadge label={profile.approvalStatus || "Pending"} tone={profile.approvalStatus === "APPROVED" ? "success" : "warning"} />}
      />

      {error ? <Text style={styles.inlineError}>{error}</Text> : null}

      {showProfile ? (
        <>
          <SectionCard title="Personal details" subtitle="Account information from your session" style={styles.cardSpacing}>
            <DetailRow label="Name" value={profile.username} />
            <DetailRow label="Role" value={profile.role} />
            <DetailRow label="Phone" value={profile.phone} />
            <DetailRow label="Email" value={profile.email} />
          </SectionCard>

          <SectionCard title="Residence" subtitle="Your registered society and flat" style={styles.cardSpacing}>
            <DetailRow label="Society" value={profile.society} />
            <DetailRow label="Block / Tower" value={profile.block} />
            <DetailRow label="Flat" value={profile.flat} />
            <DetailRow label="Approval status" value={profile.approvalStatus} />
          </SectionCard>
        </>
      ) : null}

      {showContactManager ? (
        <SectionCard title="Emergency contacts" subtitle="Manage trusted people who can be reached quickly" style={styles.cardSpacing}>
          {profile.emergencyContacts.length === 0 ? (
            <EmptyState title="No contacts yet" message="Add a trusted contact to strengthen your emergency support network." icon="people-outline" />
          ) : (
            profile.emergencyContacts.map((contact) => {
              const verificationTone = contact.verificationState === "verified" ? "success" : contact.verificationState === "failed" ? "danger" : "warning";

              return (
                <View key={contact.id || `${contact.name}-${contact.phone}`} style={styles.contactItem}>
                  <View style={styles.contactRow}>
                    <View style={styles.contactMeta}>
                      <View style={styles.contactTitleRow}>
                        <Text style={styles.contactName}>{contact.name || "Contact"}</Text>
                        {contact.contact_type === "PRIMARY_GUARDIAN" ? (
                          <StatusBadge label="Primary" tone="success" compact style={styles.primaryTag} />
                        ) : null}
                      </View>
                      <Text style={styles.helper}>{contact.relationship || "Relationship not provided"}</Text>
                      <Text style={styles.helper}>{contact.phone || "Phone not provided"}</Text>
                    </View>
                    <StatusBadge label={contact.verificationLabel} tone={verificationTone} compact />
                  </View>

                  {verificationError ? <Text style={styles.error}>{verificationError}</Text> : null}

                  <View style={styles.contactActions}>
                    <AppButton title={resendingContactId === contact.id ? "Sending..." : "Resend"} onPress={() => handleResendVerification(contact.id)} disabled={resendingContactId === contact.id} variant="secondary" style={styles.contactButton} />
                    <AppButton title="Edit" onPress={() => startEditContact(contact)} variant="secondary" style={styles.contactButton} />
                    <AppButton title="Remove" onPress={() => handleDeleteContact(contact.id)} variant="danger" style={styles.contactButton} />
                    {contact.contact_type !== "PRIMARY_GUARDIAN" ? (
                      <AppButton title="Make primary" onPress={() => handleMarkPrimary(contact)} variant="secondary" style={styles.contactButton} />
                    ) : null}
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.inputSection}>
            <Text style={styles.label}>{editingContactId ? "Edit contact" : "Add contact"}</Text>
            <AppTextInput placeholder="Contact name" value={contactForm.name} onChangeText={(value) => setContactForm((prev) => ({ ...prev, name: value }))} />
            <AppTextInput placeholder="Phone" value={contactForm.phone} onChangeText={(value) => setContactForm((prev) => ({ ...prev, phone: value }))} keyboardType="phone-pad" />
            <AppTextInput placeholder="Relationship" value={contactForm.relationship} onChangeText={(value) => setContactForm((prev) => ({ ...prev, relationship: value }))} />
            <AppTextInput placeholder="Contact type" value={contactForm.contact_type} onChangeText={(value) => setContactForm((prev) => ({ ...prev, contact_type: value }))} />
            {contactFormError ? <Text style={styles.error}>{contactFormError}</Text> : null}
            <View style={styles.contactActions}>
              <AppButton title={contactSaving ? "Saving..." : editingContactId ? "Save changes" : "Add contact"} onPress={handleContactSubmit} loading={contactSaving} style={styles.contactButton} />
              {editingContactId ? <AppButton title="Cancel" onPress={resetContactForm} variant="secondary" style={styles.contactButton} /> : null}
            </View>
          </View>
        </SectionCard>
      ) : null}

      <SectionCard title="Account details" subtitle="Session data shown for reference" style={styles.cardSpacing}>
        <Text style={styles.helper}>Phone and email are shown from the current session, but they are not editable through the backend endpoints available in this project.</Text>
      </SectionCard>

      <SectionCard title="Return home" subtitle="Jump back to your dashboard." style={styles.cardSpacing}>
        <AppButton title="Back to dashboard" onPress={() => router.replace("/dashboard")} variant="secondary" />
      </SectionCard>
    </AppScreen>
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
  cardSpacing: { marginBottom: 14 },
  loadingCard: { alignItems: "center", marginBottom: 14 },
  retryButton: { marginTop: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: appColors.border },
  rowLabel: { fontWeight: "700", color: appColors.slate },
  rowValue: { flex: 1, textAlign: "right", color: appColors.navy, marginLeft: 8 },
  helper: { color: appColors.slate, marginTop: 4, lineHeight: 20 },
  inlineError: { color: appColors.red, marginBottom: 12 },
  error: { color: appColors.red, marginTop: 6 },
  inputSection: { marginTop: 14 },
  label: { fontWeight: "700", color: appColors.navy, marginBottom: 8 },
  contactItem: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 12, marginTop: 10, backgroundColor: "#fafcff" },
  contactRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  contactMeta: { flex: 1, marginRight: 8 },
  contactTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  primaryTag: { marginLeft: 8 },
  contactName: { fontWeight: "700", color: appColors.navy },
  contactActions: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  contactButton: { marginRight: 8, marginBottom: 8 },
});
