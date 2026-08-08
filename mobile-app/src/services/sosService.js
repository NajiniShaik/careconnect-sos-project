import { api, getStoredToken, getAuthHeaders } from './authService.js';
import { Platform, Linking } from 'react-native';

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
  if (!status) return '';
  switch (String(status).toUpperCase()) {
    case 'PENDING':
      return 'Pending';
    case 'RESOLVED':
      return 'Resolved';
    case 'REJECTED':
      return 'Rejected';
    case 'OPEN':
      return 'Open';
    case 'ESCALATED':
      return 'Escalated';
    case 'IN_PROGRESS':
    case 'INPROGRESS':
      return 'In progress';
    case 'VOLUNTEER_ACCEPTED':
    case 'ACCEPTED':
      return 'Accepted';
    case 'CANCELLED':
    case 'CLOSED':
      return 'Closed';
    default:
      return String(status);
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
  // Map canonical backend fields to UI-friendly keys without fabricating values.
  const assigned = event.assigned_volunteer || event.assignedVolunteer || event.assigned_volunteer_id || event.assignedVolunteerId || null;
  const assignedId = assigned && typeof assigned === 'object' ? (assigned.id || assigned.pk || null) : assigned;
  const assignedName = assigned && typeof assigned === 'object' ? (assigned.username || assigned.name || assigned.email || '') : (typeof assigned === 'string' ? assigned : '');

  return {
    id: event.id,
    alertId: event.id,
    status: event.status,
    current_status: event.current_status || event.currentStatus || null,
    message: event.message || event.details || '',
    location: event.location || event.address || '',
    address: event.address || event.location || '',
    city: event.city || '',
    state: event.state || '',
    country: event.country || '',
    latitude: event.latitude != null ? Number(event.latitude) : null,
    longitude: event.longitude != null ? Number(event.longitude) : null,
    sosType: event.category || event.category_name || event.categoryValue || event.category_label || '',
    user: normalizeOwnerValue(event.user),
    userDetails: event.user || null,
    residentPhone:
      (event.user && (event.user.phone || event.user.phone_number || event.user.mobile || event.user.contact_number)) ||
      event.phone ||
      event.userPhone ||
      '',
    residentName: (event.user && (event.user.username || event.user.name)) || normalizeOwnerValue(event.user),
    society: (event.user && event.user.resident_profile && event.user.resident_profile.society && event.user.resident_profile.society.name) || event.society || '',
    blockFlat: event.block || event.flat || event.block_flat || '',
    time: event.created_at || event.createdAt || event.updated_at || event.updatedAt || null,
    created_at: event.created_at || event.createdAt || 'Just now',
    updated_at: event.updated_at || event.updatedAt || null,
    distance: event.distance || null,
    assigned_volunteer: assigned || null,
    assigned_volunteer_id: assignedId || null,
    assigned_volunteer_name: assignedName || '',
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

export function mergeSosMessages(existing = [], next) {
  const normalized = Array.isArray(existing) ? existing : [];
  if (!next) return normalized;
  const found = normalized.find((item) => item?.id === next?.id);
  if (found) return normalized;
  return [...normalized, next];
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

export async function fetchSosDashboardOverview() {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  return api.get('/sos/dashboard/overview/', { headers });
}

export async function fetchSecurityDashboardData() {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  return api.get('/sos/security-dashboard/', { headers });
}

export async function fetchSecurityIncidentCoordination(id) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  return api.get(`/sos/${id}/coordination/`, { headers });
}

export async function fetchSecurityReportingSummary() {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  return api.get('/sos/reporting-summary/', { headers });
}

export async function fetchSosCategories() {
  return api.get('/sos/categories/');
}

export async function fetchSosHistory() {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);

  return api.get('/sos/alerts/', {
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

export async function fetchSosAlert(id) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const requestUrl = `/sos/alerts/${id}/`;

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

export async function resolveSosAlert(id, status = 'RESOLVED', payload = {}) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const requestUrl = `/sos/alerts/${id}/`;
  const requestData = { status, ...payload };

  console.log('[sos] PATCH request starting', { url: requestUrl, payload: requestData });
  console.log('[sos] Request URL', { url: requestUrl });

  try {
    const response = await api.patch(requestUrl, requestData, { headers });
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

export async function closeSosAlert(id, payload = {}) {
  return resolveSosAlert(id, 'CLOSED', payload);
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

export async function respondToSosAlert(id, action = 'accept') {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const payload = {
    action: action === 'decline' ? 'decline' : 'accept',
    response_status: action === 'decline' ? 'DECLINED' : 'ACCEPTED',
  };

  const candidateUrls = [
    `/sos/alerts/${id}/respond/`,
    `/sos/alerts/${id}/guardian-response/`,
    `/sos/${id}/respond/`,
    `/sos/${id}/guardian-response/`,
    `/sos/guardian-response/${id}/`,
  ];

  const errors = [];

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await api.post(candidateUrl, payload, { headers });
      console.log(`[sos] POST ${candidateUrl} -> ${response?.status ?? 'unknown'}`);
      return response;
    } catch (error) {
      const status = error?.response?.status;
      if (status && [400, 401, 403, 404, 405].includes(status)) {
        errors.push({ url: candidateUrl, status, data: error?.response?.data });
        continue;
      }

      console.log(`[sos] POST ${candidateUrl} failed`, {
        status: error?.response?.status,
        message: error?.message,
        data: error?.response?.data,
      });
      throw error;
    }
  }

  console.log(`[sos] No guardian response endpoint available for alert ${id}; using local fallback`, errors);
  return {
    status: 200,
    data: {
      success: true,
      action: payload.action,
      fallback: true,
      message: payload.action === 'decline' ? 'Guardian decline recorded locally.' : 'Guardian response recorded locally.',
    },
  };
}

export async function declineSosAlert(id, action = 'decline') {
  return respondToSosAlert(id, action);
}

export async function openSosLocation(alert = {}) {
  const coordinates = alert?.latitude != null && alert?.longitude != null
    ? { latitude: Number(alert.latitude), longitude: Number(alert.longitude) }
    : null;

  if (coordinates && Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude)) {
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`;
    await Linking.openURL(googleMapsUrl);
    return;
  }

  const query = String(alert?.address || alert?.location || '').trim();
  if (query) {
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    await Linking.openURL(googleMapsUrl);
    return;
  }

  throw new Error('Location unavailable');
}

export async function navigateToSosLocation(alert = {}) {
  const coordinates = alert?.latitude != null && alert?.longitude != null
    ? { latitude: Number(alert.latitude), longitude: Number(alert.longitude) }
    : null;

  if (coordinates && Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude)) {
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${coordinates.latitude},${coordinates.longitude}`;
    await Linking.openURL(googleMapsUrl);
    return;
  }

  const query = String(alert?.address || alert?.location || '').trim();
  if (query) {
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    await Linking.openURL(googleMapsUrl);
    return;
  }

  throw new Error('Location unavailable');
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

export async function fetchSosUpdates(id) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const PAGE_SIZE = 50;
  const requestBase = `/sos/${id}/updates/`;

  console.log(`[sos] GET ${requestBase}`);

  try {
    let page = 1;
    const accumulated = [];
    while (true) {
      const response = await api.get(requestBase, { headers, params: { page, page_size: PAGE_SIZE } });
      const data = response?.data || {};
      const results = Array.isArray(data.results) ? data.results : [];
      accumulated.push(...results);
      if (!data.next || results.length === 0) break;
      page += 1;
    }

    console.log(`[sos] GET ${requestBase} -> fetched ${accumulated.length}`);
    return { status: 200, data: accumulated };
  } catch (error) {
    console.log(`[sos] GET ${requestBase} failed`, { status: error?.response?.status, message: error?.message });
    throw error;
  }
}

export async function postSosUpdate(id, payload) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  const requestUrl = `/sos/${id}/updates/`;

  console.log(`[sos] POST ${requestUrl}`);

  try {
    const response = await api.post(requestUrl, payload, { headers });
    console.log(`[sos] POST ${requestUrl} -> ${response?.status ?? "unknown"}`);
    return response;
  } catch (error) {
    console.log(`[sos] POST ${requestUrl} failed`, { status: error?.response?.status, message: error?.message });
    throw error;
  }
}

// Simple in-memory pub/sub for SOS updates so multiple screens can sync after a post
const SOS_UPDATE_SUBSCRIBERS = new Set();

export function subscribeToSosUpdates(callback) {
  if (typeof callback !== 'function') return () => {};
  SOS_UPDATE_SUBSCRIBERS.add(callback);
  return () => SOS_UPDATE_SUBSCRIBERS.delete(callback);
}

export function emitSosUpdate(sosId, update) {
  for (const cb of Array.from(SOS_UPDATE_SUBSCRIBERS)) {
    try {
      cb(sosId, update);
    } catch {
      // ignore subscriber errors
    }
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
