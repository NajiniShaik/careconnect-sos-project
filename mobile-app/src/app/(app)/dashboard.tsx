import React, { useEffect, useState, useRef } from "react";
import { Animated, Easing, Image, Linking, NativeEventEmitter, NativeModules, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { AppIcon, AppScreen, PageHeader, SectionCard, StatusBadge, appColors } from "../../components/common/designSystem";
import { getErrorMessage, getStoredUser } from "../../services/authService";
import { buildSosRequestPayload, fetchSosCategories, triggerSosRequest } from "../../services/sosService";

let MapView = null;
let Marker = null;

if (Platform.OS !== "web") {
  // Load native map components lazily so web bundling doesn't try to resolve the native module.
  try {
    const maps = require("react-native-maps");
    MapView = maps?.default || maps?.MapView || null;
    Marker = maps?.Marker || null;
  } catch (error) {
    console.log("[dashboard] react-native-maps unavailable", error);
    MapView = null;
    Marker = null;
  }
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [sosError, setSosError] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedPriority, setSelectedPriority] = useState("HIGH");
  const [emergencyDescription, setEmergencyDescription] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [locationCoordinates, setLocationCoordinates] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [pulseScale] = useState(new Animated.Value(1));
  const [pulseOpacity] = useState(new Animated.Value(0.35));
  const srModuleRef = useRef(null);
  const srSubscriptionsRef = useRef([]);

  // Voice event listeners are attached dynamically when the native module is available.

  useEffect(() => {
    const loadUser = async () => {
      const storedUser = await getStoredUser();
      setUser(storedUser);
    };

    void loadUser();
  }, []);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetchSosCategories();
        const categoryList = Array.isArray(response?.data?.categories) ? response.data.categories : [];
        setCategories(categoryList);
        if (categoryList.length > 0) {
          setSelectedCategory((current) => current || categoryList[0].value);
        }
      } catch (error) {
        console.log("[dashboard] Failed to load SOS categories", error);
      }
    };

    void loadCategories();
  }, []);

  useEffect(() => {
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.08, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ])
    );
    const opacityLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    );

    scaleLoop.start();
    opacityLoop.start();

    return () => {
      scaleLoop.stop();
      opacityLoop.stop();
    };
  }, [pulseOpacity, pulseScale]);

  const refreshResidentContext = async () => {
    setUser(await getStoredUser());
  };

  const loadCurrentLocation = async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshingLocation(true);
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log("[sos] location permission status", status);

      if (status !== "granted") {
        setLocationCoordinates(null);
        setLocationStatus("unavailable");
        return null;
      }

      const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
      const nextCoordinates = {
        latitude: currentLocation?.coords?.latitude,
        longitude: currentLocation?.coords?.longitude,
      };

      if (
        typeof nextCoordinates.latitude === "number" &&
        typeof nextCoordinates.longitude === "number" &&
        Number.isFinite(nextCoordinates.latitude) &&
        Number.isFinite(nextCoordinates.longitude)
      ) {
        setLocationCoordinates(nextCoordinates);
        setLocationStatus("available");
        return nextCoordinates;
      }

      setLocationCoordinates(null);
      setLocationStatus("unavailable");
      return null;
    } catch (error) {
      console.log("[dashboard] Failed to fetch current location", error);
      setLocationCoordinates(null);
      setLocationStatus("unavailable");
      return null;
    } finally {
      setRefreshingLocation(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeLocation = async () => {
      if (user?.role?.toUpperCase() === "RESIDENT") {
        const coordinates = await loadCurrentLocation(false);
        if (!isMounted) {
          return;
        }

        if (!coordinates) {
          setLocationCoordinates(null);
          setLocationStatus("unavailable");
        }
      }
    };

    void initializeLocation();

    return () => {
      isMounted = false;
    };
  }, [user?.role]);

  const handleVoiceInput = async () => {
    if (Platform.OS === "web") {
      setVoiceError("Voice input unavailable.");
      return;
    }

    // If already listening, stop and cleanup
    if (isListening) {
      try {
        const mod = srModuleRef.current;
        if (mod?.stop) mod.stop();
      } catch (error) {
        console.log("[dashboard] Failed to stop voice input", error);
      }
      // remove listeners
      srSubscriptionsRef.current.forEach((s) => s.remove && s.remove());
      srSubscriptionsRef.current = [];
      setIsListening(false);
      return;
    }

    // Try to load the native module at the time of use so app startup doesn't fail
    let srPackage;
    try {
      // dynamic import so Metro doesn't attempt to load native module at startup
      srPackage = await import("expo-speech-recognition");
    } catch (err) {
      console.log("[dashboard] Speech recognition module not available", err);
      setVoiceError("Voice input unavailable.");
      return;
    }

    const mod = srPackage?.ExpoSpeechRecognitionModule || NativeModules.ExpoSpeechRecognition;
    if (!mod) {
      setVoiceError("Voice input unavailable.");
      return;
    }

    srModuleRef.current = mod;

    try {
      const permission = await mod.requestPermissionsAsync();
      if (!permission?.granted) {
        setVoiceError("Voice input unavailable.");
        return;
      }

      setVoiceError("");
      setIsListening(true);

      // Attach event listeners using NativeEventEmitter
      try {
        const emitter = new NativeEventEmitter(mod);

        const resultSub = emitter.addListener("result", (event) => {
          const transcriptText = event?.results?.[0]?.transcript || "";
          if (transcriptText) {
            setEmergencyDescription((current) => `${current}${current ? " " : ""}${transcriptText}`.slice(0, 500));
          }
        });

        const endSub = emitter.addListener("end", () => {
          setIsListening(false);
          // cleanup
          srSubscriptionsRef.current.forEach((s) => s.remove && s.remove());
          srSubscriptionsRef.current = [];
        });

        const errorSub = emitter.addListener("error", () => {
          setVoiceError("Voice input unavailable.");
          setIsListening(false);
          srSubscriptionsRef.current.forEach((s) => s.remove && s.remove());
          srSubscriptionsRef.current = [];
        });

        srSubscriptionsRef.current = [resultSub, endSub, errorSub];
      } catch (err) {
        // If adding event listeners fails, continue but rely on stop callbacks
        console.log("[dashboard] failed to attach speech listeners", err);
      }

      // Start recognition
      mod.start({ lang: "en-US", interimResults: true, continuous: false });
    } catch (error) {
      console.log("[dashboard] Voice input failed", error);
      setVoiceError("Voice input unavailable.");
      setIsListening(false);
    }
  };

  const handleSendSos = async () => {
    const role = user?.role?.toUpperCase();

    if (role !== "RESIDENT") {
      const message = "SOS alerts are available for resident accounts only.";
      setSosError(message);
      setStatusMessage(message);
      return;
    }

    setSending(true);
    setSosError("");
    setStatusMessage("Sending SOS alert...");

    try {
      const resolvedMessage = emergencyDescription.trim()
        ? emergencyDescription.trim()
        : "Emergency alert triggered from mobile app";
      const payload = buildSosRequestPayload(resolvedMessage, locationLabel, selectedCategory, locationCoordinates, selectedPriority);
      const response = await triggerSosRequest(payload);
      setConfirmation({
        category: selectedCategory,
        message: response?.data?.message || "SOS sent successfully.",
        status: response?.data?.status || "OPEN",
      });
      setStatusMessage(response?.data?.message || "SOS sent successfully.");
    } catch (err) {
      const message = getErrorMessage(err);
      setSosError(message);
      setStatusMessage(`SOS send failed: ${message}`);
      setConfirmation(null);
    } finally {
      setSending(false);
    }
  };

  const locationLabel = user?.society && user?.flat ? `${user.society} • Flat ${user.flat}` : user?.society || user?.flat || "Location unavailable";

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Emergency dashboard"
        title={`${getGreeting()}, ${user?.username || "resident"}`}
        subtitle="Your safety tools are ready when you need them."
        action={<StatusBadge label="Live" tone="success" compact />}
      />

      <SectionCard style={styles.summaryCard}>
        <View style={styles.summaryTopRow}>
          <View style={styles.summaryTextWrap}>
            <Text style={styles.greetingText}>Hello, {user?.username || "resident"}</Text>
            <Text style={styles.nameText}>{user?.username || "Resident"}</Text>
            <Text style={styles.metaText}>{user?.society || "Society not available"} • {user?.flat || "Flat not available"}</Text>
          </View>
          <Pressable style={styles.callButton} onPress={() => Linking.openURL("tel:112")}>
            <AppIcon name="warning-outline" size={16} color={appColors.white} />
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard title="SOS center" subtitle="Choose a category, then trigger urgent help" style={styles.sosCard}>
        <View style={styles.categoryWrap}>
          {categories.map((item) => {
            const isSelected = selectedCategory === item.value;
            return (
              <Pressable
                key={item.value}
                style={[styles.categoryOption, isSelected ? styles.categoryOptionSelected : null]}
                onPress={() => setSelectedCategory(item.value)}
              >
                <Text style={[styles.categoryOptionText, isSelected ? styles.categoryOptionTextSelected : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.prioritySection}>
          <Text style={styles.descriptionLabel}>Priority</Text>
          <View style={styles.priorityWrap}>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((priority) => {
              const isSelected = selectedPriority === priority;
              return (
                <Pressable
                  key={priority}
                  style={[styles.priorityOption, isSelected ? styles.priorityOptionSelected : null]}
                  onPress={() => setSelectedPriority(priority)}
                >
                  <Text style={[styles.priorityOptionText, isSelected ? styles.priorityOptionTextSelected : null]}>{priority}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.descriptionSection}>
          <View style={styles.descriptionHeaderRow}>
            <Text style={styles.descriptionLabel}>Emergency Description</Text>
            <Pressable
              style={[styles.voiceButton, styles.voiceButtonDisabled]}
              disabled
              onPress={() => void handleVoiceInput()}
            >
              <AppIcon name="mic-off-outline" size={16} color={appColors.muted} />
            </Pressable>
          </View>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Describe your emergency..."
            placeholderTextColor={appColors.muted}
            value={emergencyDescription}
            onChangeText={(value) => setEmergencyDescription(value.slice(0, 500))}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <View style={styles.descriptionFooterRow}>
            <Text style={styles.voiceStatusText}>{isListening ? "Listening..." : voiceError || ""}</Text>
            <Text style={styles.descriptionCounter}>{emergencyDescription.length}/500</Text>
          </View>
        </View>

        <View style={styles.locationPreviewCard}>
          <View style={styles.locationPreviewHeader}>
            <Text style={styles.locationPreviewLabel}>Current Location</Text>
            <Pressable style={styles.refreshLocationButton} onPress={() => void loadCurrentLocation(true)} disabled={refreshingLocation}>
              <Text style={styles.refreshLocationText}>{refreshingLocation ? "Refreshing..." : "Refresh Location"}</Text>
            </Pressable>
          </View>

          {locationStatus === "available" && locationCoordinates ? (
            <View style={styles.locationPreviewContent}>
              {Platform.OS !== "web" && MapView && Marker ? (
                <MapView
                  style={styles.locationPreviewMap}
                  region={{
                    latitude: locationCoordinates.latitude,
                    longitude: locationCoordinates.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                >
                  <Marker coordinate={locationCoordinates} />
                </MapView>
              ) : (
                <View style={styles.locationPreviewMap}>
                  <Image
                    source={{
                      uri: `https://staticmap.openstreetmap.de/staticmap.php?center=${locationCoordinates.latitude},${locationCoordinates.longitude}&zoom=15&size=300x200&markers=${locationCoordinates.latitude},${locationCoordinates.longitude},red-pushpin`,
                    }}
                    style={styles.locationPreviewMap}
                    resizeMode="cover"
                  />
                </View>
              )}
              <View style={styles.locationPreviewDetails}>
                <Text style={styles.locationPreviewDetailLabel}>Latitude</Text>
                <Text style={styles.locationPreviewDetailValue}>{locationCoordinates.latitude.toFixed(6)}</Text>
                <Text style={styles.locationPreviewDetailLabel}>Longitude</Text>
                <Text style={styles.locationPreviewDetailValue}>{locationCoordinates.longitude.toFixed(6)}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.locationPreviewUnavailable}>Location unavailable.</Text>
          )}
        </View>

        <View style={styles.sosButtonWrap}>
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
          <Pressable style={styles.sosButton} onPress={handleSendSos} disabled={sending || user?.role?.toUpperCase() !== "RESIDENT"}>
            <AppIcon name="warning-outline" size={34} color={appColors.white} />
            <Text style={styles.sosButtonText}>{sending ? "Sending…" : "SOS"}</Text>
          </Pressable>
        </View>

        {confirmation ? (
          <View style={styles.confirmationBox}>
            <StatusBadge label="SOS confirmed" tone="success" compact />
            <Text style={styles.confirmationText}>Prepared for {confirmation.category || "your selected category"}. {confirmation.message}</Text>
            <Text style={styles.confirmationMeta}>Status: {confirmation.status}</Text>
          </View>
        ) : null}

        {statusMessage ? (
          <View style={styles.statusWrap}>
            <StatusBadge label={statusMessage} tone={sosError ? "danger" : "success"} compact />
          </View>
        ) : null}
        {sosError ? <Text style={styles.errorText}>{sosError}</Text> : null}
      </SectionCard>

      <SectionCard title="What happens after pressing SOS?" subtitle="Your support network is notified quickly." style={styles.infoCard}>
        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppIcon name="shield-checkmark-outline" size={16} color={appColors.blue} />
            <Text style={styles.infoText}>Security is notified</Text>
          </View>
          <View style={styles.infoRow}>
            <AppIcon name="shield-outline" size={16} color={appColors.blue} />
            <Text style={styles.infoText}>Admin is notified</Text>
          </View>
          <View style={styles.infoRow}>
            <AppIcon name="people-outline" size={16} color={appColors.blue} />
            <Text style={styles.infoText}>Emergency contacts are notified</Text>
          </View>
          <View style={styles.infoRow}>
            <AppIcon name="home-outline" size={16} color={appColors.blue} />
            <Text style={styles.infoText}>Location is shared when enabled</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Location" subtitle="Your current residence context" style={styles.locationCard}>
        <View style={styles.locationRow}>
          <View style={styles.locationTextWrap}>
            <Text style={styles.locationLabel}>Current location</Text>
            <Text style={styles.locationValue}>{locationLabel}</Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={refreshResidentContext}>
            <AppIcon name="time-outline" size={16} color={appColors.blue} />
          </Pressable>
        </View>
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summaryCard: { marginBottom: 14 },
  summaryTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTextWrap: { flex: 1 },
  greetingText: { fontSize: 15, fontWeight: "700", color: appColors.navy },
  nameText: { fontSize: 20, fontWeight: "800", color: appColors.navy, marginTop: 2 },
  metaText: { color: appColors.slate, marginTop: 6, lineHeight: 20 },
  callButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: appColors.red, justifyContent: "center", alignItems: "center", marginLeft: 12 },
  sosCard: { marginBottom: 14 },
  categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  categoryOption: { borderWidth: 1, borderColor: appColors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: appColors.white },
  categoryOptionSelected: { borderColor: appColors.blue, backgroundColor: appColors.blueSoft },
  categoryOptionText: { color: appColors.slate, fontSize: 13, fontWeight: "700" },
  categoryOptionTextSelected: { color: appColors.blue },
  prioritySection: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 12, marginBottom: 12, backgroundColor: appColors.white },
  priorityWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  priorityOption: { borderWidth: 1, borderColor: appColors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: appColors.white },
  priorityOptionSelected: { borderColor: appColors.blue, backgroundColor: appColors.blueSoft },
  priorityOptionText: { color: appColors.slate, fontSize: 13, fontWeight: "700" },
  priorityOptionTextSelected: { color: appColors.blue },
  descriptionSection: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 12, marginBottom: 12, backgroundColor: appColors.white },
  descriptionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  descriptionLabel: { color: appColors.navy, fontSize: 13, fontWeight: "700" },
  voiceButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center" },
  voiceButtonDisabled: { backgroundColor: appColors.grayLight, opacity: 0.65 },
  voiceButtonActive: { backgroundColor: appColors.red, borderWidth: 1, borderColor: appColors.redSoft },
  descriptionInput: { borderWidth: 1, borderColor: appColors.border, borderRadius: 12, minHeight: 96, paddingHorizontal: 12, paddingVertical: 10, color: appColors.navy, fontSize: 14, backgroundColor: appColors.white },
  descriptionFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  voiceStatusText: { color: appColors.red, fontSize: 12, flex: 1 },
  descriptionCounter: { color: appColors.muted, fontSize: 12, marginTop: 6, textAlign: "right" },
  locationPreviewCard: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 12, marginBottom: 12, backgroundColor: appColors.white },
  locationPreviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  locationPreviewLabel: { color: appColors.navy, fontSize: 13, fontWeight: "700" },
  refreshLocationButton: { borderRadius: 999, backgroundColor: appColors.blueSoft, paddingHorizontal: 10, paddingVertical: 6 },
  refreshLocationText: { color: appColors.blue, fontSize: 12, fontWeight: "700" },
  locationPreviewContent: { flexDirection: "row", gap: 10, alignItems: "center" },
  locationPreviewMap: { width: 140, height: 100, borderRadius: 10, overflow: "hidden" },
  locationPreviewFallback: { width: 140, height: 100, borderRadius: 10, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center", padding: 10 },
  locationPreviewFallbackText: { color: appColors.blue, fontSize: 12, fontWeight: "700", textAlign: "center" },
  locationPreviewDetails: { flex: 1 },
  locationPreviewDetailLabel: { color: appColors.muted, fontSize: 12, marginTop: 4 },
  locationPreviewDetailValue: { color: appColors.navy, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  locationPreviewUnavailable: { color: appColors.slate, fontSize: 13 },
  sosButtonWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  pulseRing: { position: "absolute", width: 188, height: 188, borderRadius: 94, borderWidth: 2, borderColor: appColors.redSoft },
  sosButton: { width: 170, height: 170, borderRadius: 85, backgroundColor: appColors.red, alignItems: "center", justifyContent: "center", shadowColor: appColors.red, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  sosButtonText: { color: appColors.white, fontSize: 20, fontWeight: "800", marginTop: 6 },
  confirmationBox: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: appColors.greenSoft },
  confirmationText: { color: appColors.navy, marginTop: 8, lineHeight: 20 },
  confirmationMeta: { color: appColors.muted, marginTop: 4, fontSize: 12 },
  statusWrap: { marginTop: 12 },
  errorText: { color: appColors.red, marginTop: 10, lineHeight: 20 },
  infoCard: { marginBottom: 14 },
  infoList: { gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  infoText: { color: appColors.slate, fontSize: 14, flex: 1 },
  locationCard: { marginBottom: 0 },
  locationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  locationTextWrap: { flex: 1 },
  locationLabel: { color: appColors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  locationValue: { color: appColors.navy, fontSize: 16, fontWeight: "700" },
  refreshButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center", marginLeft: 12 },
});