import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { deleteAsync } from "expo-file-system/legacy";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { AppButton, AppIcon, AppTextInput, appColors, StatusBadge } from "../common/designSystem";
import { buildSosRequestPayload, createMapLocationState, fetchSosCategories, getMapRegion, normalizeCoordinates, reverseGeocodeLocation, triggerSosRequest, uploadSosAudio, transcribeSosAudio } from "../../services/sosService";
import { getErrorMessage } from "../../services/authService";
import { WebView } from "react-native-webview";

import {
  startWebRecording,
  stopWebRecording,
  playWebAudio,
  deleteWebAudio
} from "./webAudio";

let MapView = null;
let Marker = null;
let UrlTile = null;


if (Platform.OS !== "web") {
  try {
    const maps = require("react-native-maps");
    MapView = maps?.default || maps?.MapView || null;
    Marker = maps?.Marker || null;
    UrlTile = maps?.UrlTile || null;
  } catch (error) {
    console.log("[sos-workflow] react-native-maps unavailable", error);
  }
}

const severityOptions = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function formatDuration(milliseconds = 0) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}


function LeafletMapPicker({ coordinates, onLocationSelect, interactive = true }) {
  if (!coordinates) return null;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: ${interactive},
          dragging: ${interactive},
          touchZoom: ${interactive},
          doubleClickZoom: ${interactive},
          scrollWheelZoom: ${interactive}
        }).setView([${coordinates.latitude}, ${coordinates.longitude}], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        var marker = L.marker([${coordinates.latitude}, ${coordinates.longitude}], {
          draggable: ${interactive}
        }).addTo(map);

        function notifyApp(lat, lng) {
          var payload = JSON.stringify({ latitude: lat, longitude: lng });
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(payload);
          } else if (window.parent) {
            window.parent.postMessage(payload, '*');
          }
        }

        ${interactive
      ? `
          marker.on('dragend', function (e) {
            var pos = e.target.getLatLng();
            notifyApp(pos.lat, pos.lng);
          });

          map.on('click', function(e) {
            marker.setLatLng(e.latlng);
            notifyApp(e.latlng.lat, e.latlng.lng);
          });
        `
      : ''
    }
      </script>
    </body>
    </html>
  `;

  const handleMessageData = (dataString) => {
    try {
      const data = typeof dataString === "string" ? JSON.parse(dataString) : dataString;
      if (data?.latitude && data?.longitude && onLocationSelect) {
        onLocationSelect({ latitude: data.latitude, longitude: data.longitude });
      }
    } catch (e) {
      console.error("Error parsing map coordinates", e);
    }
  };

  useEffect(() => {
    if (Platform.OS === "web") {
      const handleWebMessage = (event) => {
        if (event.data) {
          handleMessageData(event.data);
        }
      };

      window.addEventListener("message", handleWebMessage);
      return () => {
        window.removeEventListener("message", handleWebMessage);
      };
    }
  }, [onLocationSelect]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.mapPreviewWrap}>
        <iframe
          srcDoc={htmlContent}
          style={{ width: "100%", height: "220px", border: "none" }}
          title="Interactive Leaflet Map"
        />
      </View>
    );
  }

  return (
    <View style={styles.mapPreviewWrap}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: htmlContent }}
        onMessage={(event) => handleMessageData(event.nativeEvent.data)}
        style={styles.mapPreview}
      />
    </View>
  );
}


export default function SosWorkflowWizard({ user, onClose }) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [severity, setSeverity] = useState("HIGH");
  const [description, setDescription] = useState("");
  const [locationState, setLocationState] = useState({
    status: "idle",
    coordinates: null,
    address: "",
    loading: false,
    error: "",
  });
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submissionResult, setSubmissionResult] = useState(null);
  const [recordingError, setRecordingError] = useState("");
  const [explicitRecordingUri, setExplicitRecordingUri] = useState("");
  const [recordingDeleted, setRecordingDeleted] = useState(false);
  const [selectedLocationState, setSelectedLocationState] = useState(() => createMapLocationState(null));
  const currentStepRef = useRef(currentStep);
  const webStreamRef = useRef(null);
  const [isWebRecording, setIsWebRecording] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const isRecording = Platform.OS === "web"
    ? isWebRecording
    : Boolean(recorderState?.isRecording);

  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const mapRef = useRef(null);


  // While actively recording, recorderState.uri/url can already be populated
  // by the native module before the file is finalized. If we let that flow
  // into the player-loading effect below, the player tries to open a file
  // that's still being written to, which is what causes "stop" to appear to
  // hang and playback/delete to misbehave right after. So we force this to
  // "" until recording has actually stopped.
  const effectiveRecordingUri = isRecording
    ? ""
    : recordingDeleted
      ? ""
      : explicitRecordingUri || recorderState?.uri || recorderState?.url || "";

  console.log("EFFECTIVE URI", {
    explicitRecordingUri,
    recorderUri: recorder.uri,
    recorderStateUri: recorderState?.uri,
    recordingDeleted,
    isRecording,
    effectiveRecordingUri,
  });

  useEffect(() => {
    console.log("PLAYER STATUS", {
      loaded: playerStatus?.isLoaded,
      playing: playerStatus?.playing,
      playbackState: playerStatus?.playbackState,
      currentTime: playerStatus?.currentTime,
      duration: playerStatus?.duration,
    });
  }, [playerStatus]);



  const [loadedUri, setLoadedUri] = useState("");

  const playbackActive = Boolean(playerStatus?.playing);

  useEffect(() => {
    let cancelled = false;

    const syncPlayerSource = async () => {
      if (!effectiveRecordingUri) {
        if (loadedUri) {
          try {
            if (playerStatus?.playing) {
              await player.pause();
            }
          } catch (error) {
            console.log("[sos-workflow] failed to unload player", error);
          }
          if (!cancelled) {
            setLoadedUri("");
          }
        }
        return;
      }

      if (loadedUri === effectiveRecordingUri) {
        console.log("SYNC EFFECT", {
          loadedUri,
          effectiveRecordingUri,
        });
        return;
      }

      console.log("[sos-workflow] Loading player once:", effectiveRecordingUri);

      try {
        if (playerStatus?.playing) {
          await player.pause();
        }
        await player.replace(effectiveRecordingUri);
        if (!cancelled) {
          setLoadedUri(effectiveRecordingUri);
        }
      } catch (error) {
        console.log("[sos-workflow] failed to load recording into player", error);
        setRecordingError("Unable to load the recording for playback.");
      }
    };

    void syncPlayerSource();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRecordingUri, loadedUri, player]);

  useEffect(() => {
    console.log("[sos-workflow] playerStatus changed", {
      isLoaded: playerStatus?.isLoaded,
      playbackState: playerStatus?.playbackState,
      duration: playerStatus?.duration,
      error: playerStatus?.error,
    });
  }, [playerStatus]);

  const recordingDurationMs = typeof recorderState?.durationMillis === "number" ? recorderState.durationMillis : 0;

  const isResident = user?.role === "RESIDENT";

  const applySelectedLocation = useCallback(async (coordinates, options = {}) => {
    const normalizedCoordinates = normalizeCoordinates(coordinates);
    if (!normalizedCoordinates) {
      return;
    }

    setSelectedLocationState(createMapLocationState(normalizedCoordinates, "", "loading", ""));
    setLocationState((prev) => ({
      ...prev,
      coordinates: normalizedCoordinates,
      address: "",
      loading: false,
      error: "",
      status: "available",
    }));

    try {
      const geocoded = await reverseGeocodeLocation(normalizedCoordinates);
      const finalAddress = geocoded.address || "Address unavailable";
      const nextSelectionState = createMapLocationState(
        normalizedCoordinates,
        finalAddress,
        geocoded.geocodingStatus === "error" ? "error" : "ready",
        geocoded.geocodingError || ""
      );

      setSelectedLocationState(nextSelectionState);
      setLocationState((prev) => ({
        ...prev,
        coordinates: normalizedCoordinates,
        address: finalAddress,
        loading: false,
        error: geocoded.geocodingError || "",
        status: "available",
      }));

      const region = getMapRegion(normalizedCoordinates);
      if (options?.animate !== false && mapRef.current && typeof mapRef.current.animateToRegion === "function") {
        mapRef.current.animateToRegion(region, 300);
      }
    } catch (error) {
      const fallbackMessage = error?.message || "Unable to resolve the address right now.";
      setSelectedLocationState(createMapLocationState(normalizedCoordinates, "Address unavailable", "error", fallbackMessage));
      setLocationState((prev) => ({
        ...prev,
        coordinates: normalizedCoordinates,
        address: "Address unavailable",
        loading: false,
        error: fallbackMessage,
        status: "available",
      }));
    }
  }, []);

  const handleMapLocationSelection = useCallback(async (coordinate, options = {}) => {
    if (!coordinate) {
      return;
    }

    await applySelectedLocation(
      {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      },
      options
    );
  }, [applySelectedLocation]);

  const handleAddressRetry = useCallback(() => {
    if (selectedLocationState.coordinates) {
      void applySelectedLocation(selectedLocationState.coordinates, { animate: true });
    }
  }, [applySelectedLocation, selectedLocationState.coordinates]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetchSosCategories();
        const categoryList = Array.isArray(response?.data?.categories) ? response.data.categories : [];
        setCategories(categoryList);
        if (!selectedCategory && categoryList.length > 0) {
          setSelectedCategory(categoryList[0].value);
        }
      } catch (error) {
        console.log("[sos-workflow] failed to load categories", error);
      }
    };

    void loadCategories();
  }, [selectedCategory]);

  const loadLocation = useCallback(async (forceRefresh = false) => {
    setLocationState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationState({
          status: "error",
          coordinates: null,
          address: "",
          loading: false,
          error: "Location access was not granted.",
        });
        return;
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
        const geocoded = await reverseGeocodeLocation(nextCoordinates);

        const nextSelectionState = createMapLocationState(
          nextCoordinates,
          geocoded.address || "Address unavailable",
          geocoded.geocodingStatus === "error" ? "error" : "ready",
          geocoded.geocodingError || ""
        );

        setSelectedLocationState(nextSelectionState);
        setLocationState({
          status: "available",
          coordinates: nextCoordinates,
          address: geocoded.address || "Address unavailable",
          loading: false,
          error: geocoded.geocodingError || "",
        });
        if (forceRefresh || currentStepRef.current === 1) {
          setCurrentStep(2);
        }
        return;
      }

      setLocationState({
        status: "error",
        coordinates: null,
        address: "",
        loading: false,
        error: "We could not resolve a valid GPS position yet.",
      });
    } catch (error) {
      console.log("[sos-workflow] location load failed", error);
      setLocationState({
        status: "error",
        coordinates: null,
        address: "",
        loading: false,
        error: "Unable to capture your location right now.",
      });
    }
  }, []);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    const initializeLocation = async () => {
      await loadLocation(false);
    };

    void initializeLocation();
  }, [loadLocation]);

  useEffect(() => {
    if (Platform.OS === "web") {
      return undefined;
    }

    const requestMicPermission = async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setRecordingError("Microphone permission is required to record a voice note.");
      }
    };

    void requestMicPermission();
  }, []);

  useEffect(() => {
    console.log("PLAYER STATUS", {
      loaded: playerStatus?.isLoaded,
      playing: playerStatus?.playing,
      currentTime: playerStatus?.currentTime,
      duration: playerStatus?.duration,
      playbackState: playerStatus?.playbackState,
    });
  }, [playerStatus]);

  const previewUri = useMemo(() => {
    if (!locationState.coordinates) {
      return null;
    }

    return `https://staticmap.openstreetmap.de/staticmap.php?center=${locationState.coordinates.latitude},${locationState.coordinates.longitude}&zoom=15&size=320x180&markers=${locationState.coordinates.latitude},${locationState.coordinates.longitude},red-pushpin`;
  }, [locationState.coordinates]);

  const getAudioFileName = (uri) => {
    if (!uri) return "voice-note.m4a";
    const parts = uri.split("/");
    const lastPart = parts[parts.length - 1] || "voice-note.m4a";
    return lastPart.includes(".") ? lastPart : "voice-note.m4a";
  };

  const handleSubmit = async () => {
    const activeCoordinates = selectedLocationState.coordinates || locationState.coordinates;
    const activeAddress = selectedLocationState.address || locationState.address || "Address unavailable";

    if (!activeCoordinates) {
      setSubmitError("Please capture your location before sending the SOS.");
      return;
    }

    setSending(true);
    setSubmitError("");

    let descriptionToUse = description.trim();
    let transcriptionErrorMessage = "";

    if (!descriptionToUse && effectiveRecordingUri) {
      setTranscribing(true);
      try {
        const fileName = getAudioFileName(effectiveRecordingUri);
        const response = await transcribeSosAudio(effectiveRecordingUri, fileName);
        if (!response?.data?.success) {
          throw new Error(response?.data?.message || "Unable to transcribe audio.");
        }

        const transcript = (response.data.transcript || "").trim();
        if (!transcript) {
          throw new Error("Unable to transcribe audio.");
        }

        descriptionToUse = transcript;
        setDescription(transcript);
      } catch (error) {
        transcriptionErrorMessage =
          error?.response?.data?.message ||
          error?.message ||
          "Unable to convert voice to text. Please try again or enter the description manually.";
        descriptionToUse = description.trim() || "Emergency alert triggered from mobile app";
      } finally {
        setTranscribing(false);
      }
    }

    if (transcriptionErrorMessage) {
      setSubmitError(transcriptionErrorMessage);
    }

    try {
      const payload = buildSosRequestPayload(
        descriptionToUse || "Emergency alert triggered from mobile app",
        activeAddress,
        selectedCategory,
        activeCoordinates,
        severity
      );

      const response = await triggerSosRequest(payload);
      const incidentId = response?.data?.id ?? null;
      const nextSubmissionResult = {
        id: incidentId,
        status: response?.data?.status || "OPEN",
        message: response?.data?.message || "SOS sent successfully.",
        address: response?.data?.address || activeAddress,
        attachmentStatus: "idle",
      };

      if (incidentId && effectiveRecordingUri) {
        try {
          await uploadSosAudio(incidentId, effectiveRecordingUri);
          nextSubmissionResult.attachmentStatus = "attached";
        } catch (attachmentError) {
          nextSubmissionResult.attachmentStatus = "failed";
          nextSubmissionResult.attachmentError = getErrorMessage(attachmentError);
        }
      }

      setSubmissionResult(nextSubmissionResult);
      setCurrentStep(5);
    } catch (error) {
      const message = getErrorMessage(error);
      setSubmitError(message);
    } finally {
      setSending(false);
    }
  };

  const handleToggleRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      if (isRecording) {
        // Stopping web recording
        const audioUrl = await stopWebRecording(webStreamRef.current);
        webStreamRef.current = null;
        setIsWebRecording(false); // <--- TURN OFF WEB RECORDING UI

        if (audioUrl) {
          setExplicitRecordingUri(audioUrl);
          setRecordingDeleted(false);
          setRecordingError("");
        }
        return;
      } else {
        // Starting web recording
        const result = await startWebRecording();
        if (result.success) {
          webStreamRef.current = result.stream;
          setIsWebRecording(true); // <--- TURN ON WEB RECORDING UI
          setExplicitRecordingUri("");
          setRecordingDeleted(false);
          setRecordingError("");
        } else {
          setRecordingError(result.error);
        }
        return;
      }
    }

    if (isRecording) {
      try {
        console.log("Stopping recorder...");
        await recorder.stop();
        console.log("Recorder stopped.");

        await new Promise(resolve => setTimeout(resolve, 200));

        const nextUri = recorder.uri || recorderState?.uri || recorderState?.url || "";
        console.log("Recorder object", recorder);
        console.log("Recorder URI", recorder.uri);

        // Hand the audio session back to playback mode so the recording
        // can actually be played back right after (iOS keeps the session
        // in "recording" mode otherwise, which breaks playback).
        try {
          await setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        } catch (audioModeError) {
          console.log("[sos-workflow] failed to reset audio mode after recording", audioModeError);
        }

        setExplicitRecordingUri(nextUri);
        setRecordingDeleted(false);
        setRecordingError(nextUri ? "" : "The recording could not be saved.");

      } catch (error) {
        console.log("STOP ERROR:", error);
        console.log("STOP ERROR STRING:", String(error));
        console.log("STOP ERROR JSON:", JSON.stringify(error, null, 2));

        setRecordingError("Unable to stop the recording right now.");
      }
      return;
    }

    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setRecordingError("Microphone permission is required to record a voice note.");
        return;
      }

      // Make sure nothing is mid-playback (and holding the file/audio
      // session) before we switch into recording mode.
      if (playerStatus?.playing) {
        try {
          await player.pause();
        } catch (pauseError) {
          console.log("[sos-workflow] failed to pause player before recording", pauseError);
        }
      }

      await setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: true });
      try {
        await recorder.prepareToRecordAsync();
      } catch { }
      console.log("Recorder state before record", recorderState);
      await recorder.record();
      setRecordingDeleted(false);
      setRecordingError("");
      setExplicitRecordingUri("");
    } catch (error) {
      console.log("[sos-workflow] failed to start recording", error);
      setRecordingError("Unable to start the recording right now.");
    }
  }, [isRecording, player, playerStatus, recorder, recorderState]);

  const handlePlayRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      if (!effectiveRecordingUri) return;
      playWebAudio(effectiveRecordingUri, () => {
        // optional reset when playback finishes
      });
      return;
    }

    if (!effectiveRecordingUri) {
      setRecordingError("No recording found.");
      return;
    }

    try {
      console.log("Playing:", effectiveRecordingUri);
      setRecordingError("");

      if (!playerStatus?.isLoaded) {
        setRecordingError("Recording is still loading.");
        return;
      }

      // If the clip already finished, the player is parked at the end —
      // rewind first, otherwise play() has nothing left to play and the
      // button looks like it silently does nothing.
      const isAtEnd =
        typeof playerStatus?.duration === "number" &&
        playerStatus.duration > 0 &&
        typeof playerStatus?.currentTime === "number" &&
        playerStatus.currentTime >= playerStatus.duration - 0.05;

      if (isAtEnd) {
        await player.seekTo(0);
      }

      if (playbackActive) {
        console.log("Pausing...");
        await player.pause();
        return;
      }

      console.log("Before play()");
      await player.play();

      console.log("PLAYER OBJECT", player);

      setTimeout(() => {
        console.log("2 seconds later", {
          currentTime: player.currentTime,
          playing: player.playing,
        });
      }, 2000);

    } catch (error) {
      console.log("Play failed:", error);
      setRecordingError("Unable to play recording.");
    }
  }, [player, effectiveRecordingUri, playerStatus, playbackActive]);

  const handleDeleteRecording = useCallback(async () => {
    try {
      if (playerStatus?.playing) {
        try {
          await player.pause();
        } catch (pauseError) {
          console.log("[sos-workflow] failed to pause before delete", pauseError);
        }
      }

      // Release the player's handle on the file before deleting it —
      // otherwise the delete can silently fail because the file is still
      // in use by the player.

      setLoadedUri("");

      if (effectiveRecordingUri) {
        try {
          await deleteAsync(effectiveRecordingUri, { idempotent: true });
        } catch (deleteError) {
          console.log("[sos-workflow] failed to delete recording file", deleteError);
        }
      }

      setExplicitRecordingUri("");
      await setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      setRecordingDeleted(true);
      setRecordingError("");
    } catch (error) {
      console.log("[sos-workflow] failed to delete recording", error);
      setRecordingError("Unable to remove the recording right now.");
    }
  }, [effectiveRecordingUri, player, playerStatus]);

  const roleLabel = user?.role?.toUpperCase() || "RESIDENT";
  const canSubmit = roleLabel === "RESIDENT" && Boolean(selectedCategory) && Boolean(locationState.coordinates);


  if (!isResident) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.accessDeniedCard}>
          <View style={styles.accessDeniedIconWrap}>
            <AppIcon name="lock-closed-outline" size={32} color={appColors.red} />
          </View>
          <Text style={styles.accessDeniedTitle}>Access Denied</Text>
          <Text style={styles.accessDeniedMessage}>Only residents can create SOS incidents. Security and Admin can monitor and manage existing incidents.</Text>
          <AppButton title="Close" onPress={() => onClose?.()} variant="secondary" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.stepRow}>
        <StatusBadge label={`Step ${currentStep} of 5`} tone="neutral" compact />
        <Text style={styles.helperText}>Resident SOS workflow</Text>
      </View>

      {currentStep === 1 ? (
        <View style={styles.cardBody}>
          <View style={styles.iconWrap}>
            <AppIcon name="location-outline" size={26} color={appColors.blue} />
          </View>
          <Text style={styles.title}>Capture Location</Text>
          <Text style={styles.bodyText}>We’re locating you now so the alert includes your current position.</Text>

          {locationState.loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={appColors.blue} />
              <Text style={styles.loadingText}>Fetching your GPS location…</Text>
            </View>
          ) : null}

          {locationState.error ? <Text style={styles.errorText}>{locationState.error}</Text> : null}

          <View style={styles.actionsRow}>
            <AppButton title="Refresh Location" onPress={() => void loadLocation(true)} variant="secondary" />
            {locationState.status === "available" ? <AppButton title="Continue" onPress={() => setCurrentStep(2)} /> : null}
          </View>
        </View>
      ) : null}

      {currentStep === 2 ? (
        <View style={styles.cardBody}>
          <View style={styles.iconWrap}>
            <AppIcon name="shield-checkmark-outline" size={26} color={appColors.green} />
          </View>
          <Text style={styles.title}>Location Captured</Text>
          <Text style={styles.bodyText}>Confirm this location or refresh to get a newer position.</Text>

          {locationState.coordinates ? (
            <>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Address</Text>
                <Text style={styles.summaryValue}>{locationState.address || "Address unavailable"}</Text>
                <Text style={styles.summaryLabel}>Latitude</Text>
                <Text style={styles.summaryValue}>{locationState.coordinates.latitude.toFixed(6)}</Text>
                <Text style={styles.summaryLabel}>Longitude</Text>
                <Text style={styles.summaryValue}>{locationState.coordinates.longitude.toFixed(6)}</Text>
              </View>

              <LeafletMapPicker
                coordinates={locationState.coordinates}
                interactive={true}
                onLocationSelect={(coords) => void handleMapLocationSelection(coords)}
              />
            </>
          ) : null}






          <View style={styles.actionsRow}>
            <AppButton title="Refresh Location" onPress={() => void loadLocation(true)} variant="secondary" />
            <AppButton title="Confirm Location" onPress={() => setCurrentStep(3)} disabled={!locationState.coordinates} />
          </View>
        </View>
      ) : null
      }

      {
        currentStep === 3 ? (
          <View style={styles.cardBody}>
            <View style={styles.iconWrap}>
              <AppIcon name="warning-outline" size={26} color={appColors.red} />
            </View>
            <Text style={styles.title}>Describe Emergency</Text>
            <Text style={styles.bodyText}>Add the details that responders should see first.</Text>

            <AppTextInput label="Emergency description" multiline numberOfLines={5} value={description} onChangeText={(value) => setDescription(value.slice(0, 500))} style={styles.descriptionInput} />

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>SOS category</Text>
              <View style={styles.optionWrap}>
                {categories.map((item) => {
                  const selected = selectedCategory === item.value;
                  return (
                    <Pressable key={item.value} style={[styles.optionChip, selected ? styles.optionChipSelected : null]} onPress={() => setSelectedCategory(item.value)}>
                      <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Severity</Text>
              <View style={styles.optionWrap}>
                {severityOptions.map((option) => {
                  const selected = severity === option;
                  return (
                    <Pressable key={option} style={[styles.optionChip, selected ? styles.optionChipSelected : null]} onPress={() => setSeverity(option)}>
                      <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.placeholderBox}>
              <Pressable
                style={[styles.recordButton, isRecording ? styles.recordButtonActive : null]}
                onPress={() => void handleToggleRecording()}
                accessibilityRole="button"
                accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
              >
                <AppIcon name="mic-outline" size={18} color={isRecording ? appColors.white : appColors.muted} />
              </Pressable>
              <View style={styles.placeholderTextWrap}>
                <Text style={styles.placeholderText}>{isRecording ? "Recording…" : effectiveRecordingUri ? "Recording saved locally" : "Tap to record a voice note for this SOS."}</Text>
                {recordingDurationMs > 0 ? <Text style={styles.recordingMeta}>Duration: {formatDuration(recordingDurationMs)}</Text> : null}
                {recordingError ? <Text style={styles.recordingError}>{recordingError}</Text> : null}
              </View>
            </View>

            {effectiveRecordingUri ? (
              <View style={styles.recordingActions}>
                <AppButton
                  title={playbackActive ? "Pause" : "Play recording"}
                  onPress={() => void handlePlayRecording()}
                  variant="secondary"
                />

                <AppButton
                  title="Delete"
                  onPress={() => void handleDeleteRecording()}
                  variant="ghost"
                />
              </View>
            ) : null}

            <View style={styles.actionsRow}>
              <AppButton title="Back" variant="secondary" onPress={() => setCurrentStep(2)} />
              <AppButton title="Review SOS" onPress={() => setCurrentStep(4)} disabled={!selectedCategory} />
            </View>
          </View>
        ) : null
      }

      {
        currentStep === 4 ? (
          <View style={styles.cardBody}>
            <View style={styles.iconWrap}>
              <AppIcon name="clipboard-outline" size={26} color={appColors.blue} />
            </View>
            <Text style={styles.title}>Review SOS</Text>
            <Text style={styles.bodyText}>Check the details before sending your emergency alert.</Text>

            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>SOS category</Text>
              <Text style={styles.summaryValue}>{categories.find((item) => item.value === selectedCategory)?.label || selectedCategory || "Not selected"}</Text>
              <Text style={styles.summaryLabel}>Severity</Text>
              <Text style={styles.summaryValue}>{severity}</Text>
              <Text style={styles.summaryLabel}>Description</Text>
              <Text style={styles.summaryValue}>{description.trim() || "Emergency alert triggered from mobile app"}</Text>
            </View>




            {locationState.coordinates ? (
              <>

                <LeafletMapPicker
                  coordinates={selectedLocationState.coordinates || locationState.coordinates}
                  interactive={true}
                  onLocationSelect={(coords) => void handleMapLocationSelection(coords)}
                />

                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>Current Address</Text>
                  <Text style={styles.summaryValue}>{selectedLocationState.address || locationState.address || "Address unavailable"}</Text>
                  <Text style={styles.summaryLabel}>Latitude</Text>
                  <Text style={styles.summaryValue}>{(selectedLocationState.coordinates || locationState.coordinates)?.latitude?.toFixed(6) || "Unavailable"}</Text>
                  <Text style={styles.summaryLabel}>Longitude</Text>
                  <Text style={styles.summaryValue}>{(selectedLocationState.coordinates || locationState.coordinates)?.longitude?.toFixed(6) || "Unavailable"}</Text>
                </View>

                {selectedLocationState.geocodingStatus === "loading" ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="small" color={appColors.blue} />
                    <Text style={styles.loadingText}>Resolving address…</Text>
                  </View>
                ) : null}

                {selectedLocationState.geocodingStatus === "error" ? (
                  <Text style={styles.errorText}>{selectedLocationState.geocodingError || "Unable to resolve the address."}</Text>
                ) : null}
              </>
            ) : null}





            <View style={styles.actionsRow}>
              <AppButton title="Retry address" variant="secondary" onPress={() => void handleAddressRetry()} disabled={selectedLocationState.geocodingStatus === "loading"} />
              <AppButton title="Edit" variant="secondary" onPress={() => setCurrentStep(3)} />
            </View>

            {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
            {transcribing ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={appColors.blue} />
                <Text style={styles.loadingText}>Converting voice to text...</Text>
              </View>
            ) : null}

            <View style={styles.actionsRow}>
              <AppButton title="Edit" variant="secondary" onPress={() => setCurrentStep(3)} />
              <AppButton title={sending ? "Sending…" : "Confirm & Send SOS"} onPress={() => void handleSubmit()} loading={sending || transcribing} disabled={!canSubmit || sending || transcribing} />
            </View>
          </View>
        ) : null
      }

      {
        currentStep === 5 ? (
          <View style={styles.cardBody}>
            <View style={styles.iconWrap}>
              <AppIcon name="checkmark-circle-outline" size={26} color={appColors.green} />
            </View>
            <Text style={styles.title}>SOS Sent Successfully</Text>
            <Text style={styles.bodyText}>Your emergency request has been submitted.</Text>

            {submissionResult ? (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Incident ID</Text>
                <Text style={styles.summaryValue}>{submissionResult.id ?? "Pending"}</Text>
                <Text style={styles.summaryLabel}>Status</Text>
                <Text style={styles.summaryValue}>{submissionResult.status}</Text>
                {submissionResult.attachmentStatus === "attached" ? (
                  <>
                    <Text style={styles.summaryLabel}>Voice note</Text>
                    <Text style={styles.summaryValue}>Attached to the incident timeline.</Text>
                  </>
                ) : null}
                {submissionResult.attachmentStatus === "failed" ? (
                  <>
                    <Text style={styles.summaryLabel}>Voice note</Text>
                    <Text style={styles.errorText}>{submissionResult.attachmentError || "The voice note could not be attached."}</Text>
                  </>
                ) : null}
              </View>
            ) : null}

            <View style={styles.actionsRow}>
              <AppButton title="View in Alerts" onPress={() => router.push("/alerts")} variant="secondary" />
              <AppButton title="Done" onPress={() => onClose?.()} />
            </View>
          </View>
        ) : null
      }
    </View >
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  stepRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  helperText: { color: appColors.muted, fontSize: 12 },
  cardBody: { borderWidth: 1, borderColor: appColors.border, borderRadius: 16, padding: 14, backgroundColor: appColors.mist },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 18, fontWeight: "800", color: appColors.navy, marginBottom: 6 },
  bodyText: { fontSize: 14, color: appColors.slate, lineHeight: 20, marginBottom: 12 },
  loadingBox: { borderRadius: 14, paddingVertical: 20, alignItems: "center", backgroundColor: appColors.white },
  loadingText: { marginTop: 8, color: appColors.slate },
  summaryBox: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 12, backgroundColor: appColors.white, marginBottom: 12 },
  summaryLabel: { color: appColors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 6 },
  summaryValue: { color: appColors.navy, fontSize: 14, fontWeight: "700", marginTop: 2 },
  actionsRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 8 },
  descriptionInput: { minHeight: 110, textAlignVertical: "top" },
  fieldBlock: { marginTop: 8 },
  fieldLabel: { color: appColors.navy, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: { borderWidth: 1, borderColor: appColors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: appColors.white },
  optionChipSelected: { borderColor: appColors.blue, backgroundColor: appColors.blueSoft },
  optionText: { color: appColors.slate, fontSize: 13, fontWeight: "700" },
  optionTextSelected: { color: appColors.blue },
  placeholderBox: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: appColors.white },
  recordButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: appColors.blueSoft, justifyContent: "center", alignItems: "center" },
  recordButtonActive: { backgroundColor: appColors.red },
  placeholderTextWrap: { flex: 1 },
  placeholderText: { color: appColors.muted, fontSize: 13, flex: 1 },
  recordingMeta: { color: appColors.blue, fontSize: 12, fontWeight: "700", marginTop: 4 },
  recordingError: { color: appColors.red, fontSize: 12, marginTop: 4 },
  recordingActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  mapPreviewWrap: { marginTop: 10, borderRadius: 14, overflow: "hidden" },
  mapPreview: { width: "100%", height: 180, borderRadius: 14 },
  errorText: { color: appColors.red, marginTop: 8, lineHeight: 20 },
  accessDeniedCard: { borderWidth: 1, borderColor: appColors.border, borderRadius: 16, padding: 20, backgroundColor: appColors.mist, alignItems: "center" },
  accessDeniedIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#FFE5E5", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  accessDeniedTitle: { fontSize: 18, fontWeight: "800", color: appColors.navy, marginBottom: 8, textAlign: "center" },
  accessDeniedMessage: { fontSize: 14, color: appColors.slate, lineHeight: 20, marginBottom: 16, textAlign: "center" },
});














