import { api, getStoredToken, getAuthHeaders } from './authService.js';

export function buildSosRequestPayload(message = 'Emergency alert triggered from mobile app', location = 'UNKNOWN', category = '', coordinates = null) {
  const payload = {
    message,
    location,
    ...(category ? { category } : {}),
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

export function normalizeSosHistory(events = []) {
  if (!Array.isArray(events)) {
    return [];
  }

  return events.map((event) => normalizeSosEvent(event));
}
