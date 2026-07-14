import { api, getStoredToken, getAuthHeaders } from './authService.js';

export function buildSosRequestPayload(message = 'Emergency alert triggered from mobile app', location = 'UNKNOWN') {
  return {
    message,
    location,
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

export function normalizeSosEvent(event = {}) {
  return {
    id: event.id,
    status: event.status,
    message: event.message || event.details || 'Emergency alert',
    location: event.location || 'Location unavailable',
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

export async function fetchSosHistory() {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);

  return api.get('/sos/trigger/', {
    headers,
  });
}

export function normalizeSosHistory(events = []) {
  if (!Array.isArray(events)) {
    return [];
  }

  return events.map((event) => normalizeSosEvent(event));
}
