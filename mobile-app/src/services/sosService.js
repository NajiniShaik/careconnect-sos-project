import { api, getStoredToken, getAuthHeaders } from './authService.js';
import { Platform } from 'react-native';

let Location = null;

try {
  Location = require('expo-location');
} catch (error) {
  console.log('[sos-service] expo-location unavailable', error);
}

function formatAddressParts(addressParts = []) {
  const parts = (addressParts || []).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Address unavailable';
}

export function normalizeCoordinates(coordinates = null) {
  if (!coordinates || typeof coordinates !== 'object') {
    return null;
  }

  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

export function createMapLocationState(coordinates = null, address = '', geocodingStatus = 'ready', geocodingError = '') {
  return {
    coordinates: normalizeCoordinates(coordinates),
    address: address || 'Address unavailable',
    geocodingStatus,
    geocodingError,
  };
}

export function getMapRegion(coordinates = null, latitudeDelta = 0.01, longitudeDelta = 0.01) {
  const normalizedCoordinates = normalizeCoordinates(coordinates);

  if (!normalizedCoordinates) {
    return {
      latitude: 0,
      longitude: 0,
      latitudeDelta,
      longitudeDelta,
    };
  }

  return {
    latitude: normalizedCoordinates.latitude,
    longitude: normalizedCoordinates.longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

export async function reverseGeocodeLocation(coordinates = null) {
  const normalizedCoordinates = normalizeCoordinates(coordinates);

  if (!normalizedCoordinates || !Location?.reverseGeocodeAsync) {
    return {
      address: 'Address unavailable',
      geocodingStatus: 'error',
      geocodingError: 'Unable to resolve the address right now.',
    };
  }

  try {
    const geocodeResults = await Location.reverseGeocodeAsync(normalizedCoordinates);
    const address = formatAddressParts([
      geocodeResults?.[0]?.name,
      geocodeResults?.[0]?.street,
      geocodeResults?.[0]?.city,
      geocodeResults?.[0]?.region,
      geocodeResults?.[0]?.country,
    ]);

    return {
      address,
      geocodingStatus: address === 'Address unavailable' ? 'error' : 'ready',
      geocodingError: address === 'Address unavailable' ? 'Unable to resolve the address right now.' : '',
    };
  } catch (error) {
    return {
      address: 'Address unavailable',
      geocodingStatus: 'error',
      geocodingError: error?.message || 'Unable to resolve the address right now.',
    };
  }
}

export function buildSosRequestPayload(message = 'Emergency alert triggered from mobile app', location = 'UNKNOWN', category = '', coordinates = null, priority = 'HIGH') {
  const payload = {
    message,
    location,
    ...(category ? { category } : {}),
    ...(priority ? { priority } : {}),
  };

  const hasValidCoordinates =
    coordinates &&
    typeof coordinates.latitude === 'number' &&
    Number.isFinite(coordinates.latitude) &&
    typeof coordinates.longitude === 'number' &&
    Number.isFinite(coordinates.longitude);

  if (hasValidCoordinates) {
    payload.latitude = coordinates.latitude;
    payload.longitude = coordinates.longitude;
  }

  return payload;
}

export function getSosStatusLabel(status) {
  switch (status?.toUpperCase()) {
    case 'PENDING':
      return 'Pending';
    case 'RESOLVED':
      return 'Resolved';
    case 'REJECTED':
      return 'Rejected';
    case 'OPEN':
      return 'Open';
    default:
      return 'Unknown';
  }
}

function normalizeOwnerValue(owner) {
  if (!owner) {
    return '';
  }

  if (typeof owner === 'string') {
    return owner;
  }

  if (typeof owner === 'object') {
    return owner.username || owner.name || owner.email || owner.id || '';
  }

  return String(owner);
}

export function normalizeSosEvent(event = {}) {
  return {
    id: event.id,
    status: event.status,
    message: event.message || event.details || 'Emergency alert',
    location: event.location || 'Location unavailable',
    user: normalizeOwnerValue(event.user),
    userDetails: event.user || null,
    category: event.category || event.category_name || event.categoryValue || event.category_label || '',
    created_at: event.created_at || event.createdAt || 'Just now',
  };
}

export function mergeSosEvents(createdEvent, history = []) {
  if (!createdEvent) {
    return Array.isArray(history) ? history : [];
  }

  const normalizedHistory = Array.isArray(history) ? history : [];
  const existing = normalizedHistory.find((item) => item?.id === createdEvent.id);

  if (existing) {
    return normalizedHistory;
  }

  return [createdEvent, ...normalizedHistory];
}

export async function triggerSosRequest(payload = buildSosRequestPayload()) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);

  console.log('[sos] latitude', payload?.latitude ?? null);
  console.log('[sos] longitude', payload?.longitude ?? null);
  console.log('[sos] payload sent to /api/sos/trigger/', payload);

  return api.post(
    '/sos/trigger/',
    payload,
    {
      headers,
    }
  );
}

export async function fetchSosCategories() {
  return api.get('/sos/categories/');
}

export async function fetchSosHistory() {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);

  return api.get('/sos/trigger/', {
    headers,
  });
}

export async function fetchSosAlerts() {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);

  return api.get('/sos/alerts/', {
    headers,
  });
}

export async function resolveSosAlert(id, status = 'RESOLVED') {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const requestUrl = `/sos/alerts/${id}/`;

  console.log('[sos] PATCH request starting', { url: requestUrl, payload: { status } });
  console.log('[sos] Request URL', { url: requestUrl });

  try {
    const response = await api.patch(requestUrl, { status }, { headers });
    console.log('[sos] Response', { url: requestUrl, status: response?.status, body: response?.data });
    return response;
  } catch (error) {
    console.log('[sos] Response failure', {
      url: requestUrl,
      status: error?.response?.status,
      body: error?.response?.data,
      message: error?.message,
    });
    throw error;
  }
}

export async function deleteSosAlert(id) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const requestUrl = `/sos/alerts/${id}/`;

  console.log('[sos] DELETE request starting', { url: requestUrl });
  console.log('[sos] Request URL', { url: requestUrl });

  try {
    const response = await api.delete(requestUrl, { headers });
    console.log('[sos] Response', { url: requestUrl, status: response?.status, body: response?.data });
    return response;
  } catch (error) {
    console.log('[sos] Response failure', {
      url: requestUrl,
      status: error?.response?.status,
      body: error?.response?.data,
      message: error?.message,
    });
    throw error;
  }
}

export async function updateSosIncident(id, payload = {}) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const patchUrl = `/sos/${id}/`;

  console.log(`[sos] PATCH alert ${id}`);
  console.log(`[sos] PATCH URL ${patchUrl}`);
  console.log(`[sos] PATCH payload`, payload);

  try {
    const response = await api.patch(patchUrl, payload, { headers });
    console.log(`[sos] PATCH ${patchUrl} -> ${response?.status ?? "unknown"}`);
    return response;
  } catch (error) {
    console.log(`[sos] PATCH ${patchUrl} failed`, {
      status: error?.response?.status,
      message: error?.message,
      data: error?.response?.data,
    });
    throw error;
  }
}

export async function fetchSosMessages(id) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const requestUrl = `/sos/${id}/messages/`;

  console.log(`[sos] GET ${requestUrl}`);

  try {
    const response = await api.get(requestUrl, { headers });
    console.log(`[sos] GET ${requestUrl} -> ${response?.status ?? "unknown"}`);
    return response;
  } catch (error) {
    console.log(`[sos] GET ${requestUrl} failed`, {
      status: error?.response?.status,
      message: error?.message,
    });
    throw error;
  }
}

export async function postSosMessage(id, message) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const requestUrl = `/sos/${id}/message/`;

  console.log(`[sos] POST ${requestUrl}`);

  try {
    const response = await api.post(requestUrl, { message }, { headers });
    console.log(`[sos] POST ${requestUrl} -> ${response?.status ?? "unknown"}`);
    return response;
  } catch (error) {
    console.log(`[sos] POST ${requestUrl} failed`, {
      status: error?.response?.status,
      message: error?.message,
    });
    throw error;
  }
}

export async function uploadSosAudio(id, audioUri, fileName = "voice-note.m4a") {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const requestUrl = `/sos/${id}/message/`;

  if (!audioUri) {
    throw new Error("No audio file available for upload.");
  }

  const formData = new FormData();
  formData.append("message", "Voice note attached");

  if (Platform.OS === 'web') {
    const response = await fetch(audioUri);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: blob.type || 'audio/webm' });
    formData.append("audio", file);
  } else {
    formData.append("audio", {
      uri: audioUri,
      name: fileName,
      type: "audio/m4a",
    });
  }

  console.log(`[sos] POST ${requestUrl} (audio upload)`);

  try {
    const response = await api.post(requestUrl, formData, { headers });
    console.log(`[sos] POST ${requestUrl} (audio upload) -> ${response?.status ?? "unknown"}`);
    return response;
  } catch (error) {
    console.log(`[sos] POST ${requestUrl} (audio upload) failed`, {
      status: error?.response?.status,
      message: error?.message,
    });
    throw error;
  }
}

export async function transcribeSosAudio(audioUri, fileName = "voice-note.m4a") {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const requestUrl = `/sos/transcribe/`;

  if (!audioUri) {
    throw new Error("No audio file available for transcription.");
  }

  const formData = new FormData();

  if (Platform.OS === 'web') {
    const response = await fetch(audioUri);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: blob.type || 'audio/webm' });
    formData.append("audio", file);
  } else {
    formData.append("audio", {
      uri: audioUri,
      name: fileName,
      type: "audio/m4a",
    });
  }

  console.log(`[sos] POST ${requestUrl} (audio transcription)`);

  try {
    const response = await api.post(requestUrl, formData, { headers, timeout: 60000 });
    console.log(`[sos] POST ${requestUrl} (audio transcription) -> ${response?.status ?? "unknown"}`);
    return response;
  } catch (error) {
    console.log(`[sos] POST ${requestUrl} (audio transcription) failed`, {
      status: error?.response?.status,
      message: error?.message,
    });
    throw error;
  }
}

export function normalizeSosHistory(events = []) {
  if (!Array.isArray(events)) {
    return [];
  }

  return events.map((event) => normalizeSosEvent(event));
}
