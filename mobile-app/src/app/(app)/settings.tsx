import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { AppScreen, PageHeader, SectionCard, AppButton, appColors } from "../../components/common/designSystem";
import { getStoredUser, clearAuth } from "../../services/authService";

export default function SettingsRoute() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      setUser(await getStoredUser());
    };

    void loadUser();
  }, []);

  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";

  const handleLogoutConfirm = async () => {
    try {
      console.log("[settings] Starting logout...");
      setIsLoggingOut(true);
      await clearAuth();
      console.log("[settings] Auth cleared, navigating to root...");
      setShowLogoutModal(false);
      router.replace("/?logout=1");
    } catch (error) {
      console.error("[settings] Logout error:", error);
      setIsLoggingOut(false);
    }
  };

  return (
    <AppScreen>
      <PageHeader eyebrow="Settings" title="App settings" subtitle="Control your profile, safety, and notification preferences." />

      <SectionCard title="Profile" subtitle="View your resident account details and contact information." style={styles.cardSpacing}>
        <AppButton title="Open profile" onPress={() => router.push("/profile")} style={styles.fullWidthButton} />
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Role</Text>
          <Text style={styles.settingValue}>{user?.role || "Unknown"}</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Email</Text>
          <Text style={styles.settingValue}>{user?.email || "Not available"}</Text>
        </View>
      </SectionCard>

      {isAdmin ? (
        <SectionCard title="Society setup" subtitle="Manage society related setup for administrators." style={styles.cardSpacing}>
          <AppButton title="Open society setup" onPress={() => router.push("/society-setup")} variant="secondary" style={styles.fullWidthButton} />
        </SectionCard>
      ) : null}

      <SectionCard title="Application" subtitle="General app preferences." style={styles.cardSpacing}>
        <SettingRow label="Dark mode" />
        <SettingRow label="Language" />
        <SettingRow label="Notifications" />
        <SettingRow label="Location access" />
        <SettingRow label="Theme" />
      </SectionCard>

      <SectionCard title="Emergency settings" subtitle="Manage emergency behavior." style={styles.cardSpacing}>
        <SettingRow label="Emergency contacts" />
        <SettingRow label="SOS settings" />
        <SettingRow label="Location sharing" />
      </SectionCard>

      <SectionCard title="Support" subtitle="Need help or want to learn more?" style={styles.cardSpacing}>
        <SettingRow label="Help center" />
        <SettingRow label="Contact support" />
        <SettingRow label="Privacy policy" />
        <SettingRow label="Terms" />
        <SettingRow label="About CareConnect" />
      </SectionCard>

      <SectionCard title="Account" style={styles.cardSpacing}>
        <AppButton 
          title="Sign out" 
          onPress={() => {
            console.log("[settings] Opening logout modal...");
            setShowLogoutModal(true);
          }} 
          variant="secondary" 
          style={styles.logoutButton} 
        />
      </SectionCard>

      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => !isLoggingOut && setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sign out?</Text>
            <Text style={styles.modalMessage}>
              You will need to sign in again to access CareConnect.
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowLogoutModal(false)}
                disabled={isLoggingOut}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleLogoutConfirm}
                disabled={isLoggingOut}
              >
                <Text style={styles.confirmButtonText}>
                  {isLoggingOut ? "Signing out..." : "Sign out"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

function SettingRow({ label }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>Configure</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: 14 },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: appColors.border },
  settingLabel: { color: appColors.navy, fontSize: 15, fontWeight: "700" },
  settingValue: { color: appColors.slate },
  fullWidthButton: { width: "100%", marginBottom: 12 },
  logoutButton: { width: "100%" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    width: "80%",
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: appColors.navy,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: appColors.slate,
    marginBottom: 20,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: appColors.border,
  },
  cancelButtonText: {
    color: appColors.navy,
    fontWeight: "600",
    fontSize: 14,
  },
  confirmButton: {
    backgroundColor: appColors.red,
  },
  confirmButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
});
