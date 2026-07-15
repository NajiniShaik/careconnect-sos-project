import { api, getStoredToken, getAuthHeaders } from './authService.js';

export function buildSosRequestPayload(message = 'Emergency alert triggered from mobile app', location = 'UNKNOWN', category = '') {
  return {
    message,
    location,
    ...(category ? { category } : {}),
  };
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

  return api.patch(`/sos/alerts/${id}/`, { status }, { headers });
}

export async function deleteSosAlert(id) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);

  return api.delete(`/sos/alerts/${id}/`, { headers });
}

export function normalizeSosHistory(events = []) {
  if (!Array.isArray(events)) {
    return [];
  }

  return events.map((event) => normalizeSosEvent(event));
}
