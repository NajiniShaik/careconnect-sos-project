import { api, getApiBaseUrl, getAuthHeaders, getStoredToken } from './authService';

export async function fetchChatHistory(incidentId) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  return api.get(`/sos/${incidentId}/chat/`, { headers });
}

export async function postChatMessage(incidentId, message) {
  const token = await getStoredToken();
  const headers = await getAuthHeaders(token);
  return api.post(`/sos/${incidentId}/chat/`, { message }, { headers });
}

export function buildChatSocketUrl(incidentId, baseUrl = null, token = null) {
  if (!incidentId) {
    return null;
  }

  const resolvedBaseUrl = String(baseUrl || '').trim() || getApiBaseUrl();
  if (!resolvedBaseUrl) {
    return null;
  }

  const withoutApiSuffix = resolvedBaseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
  if (!withoutApiSuffix) {
    return null;
  }

  const protocol = withoutApiSuffix.startsWith('https://') ? 'wss://' : 'ws://';
  const host = withoutApiSuffix.replace(/^https?:\/\//, '');
  const query = token ? `?token=${encodeURIComponent(String(token))}` : '';
  return `${protocol}${host}/ws/chat/${encodeURIComponent(String(incidentId))}/${query}`;
}
