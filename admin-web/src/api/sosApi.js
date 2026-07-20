import axios from "axios";

const API = "http://127.0.0.1:8000/api/sos";

function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(decoded)));
  } catch (e) {
    return null;
  }
}

async function tryRefresh() {
  const refresh = localStorage.getItem('refresh');
  if (!refresh) return false;

  try {
    const resp = await axios.post('http://127.0.0.1:8000/api/token/refresh/', { refresh });
    if (resp?.data?.access) {
      localStorage.setItem('access', resp.data.access);
      if (resp.data.refresh) localStorage.setItem('refresh', resp.data.refresh);
      return true;
    }
  } catch (e) {
    console.log('[sosApi] token refresh failed', e?.response?.status, e?.response?.data);
  }

  return false;
}

const getConfig = async () => {
  let token = localStorage.getItem('access');
  if (!token) {
    console.log('[sosApi] no access token available for SOS request');
    return {};
  }

  const payload = parseJwt(token);
  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && payload.exp <= now) {
    const refreshed = await tryRefresh();
    if (!refreshed) return {};
    token = localStorage.getItem('access');
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

export const getSosAlerts = async () => {
  const cfg = await getConfig();
  return axios.get(`${API}/alerts/`, cfg);
};

export const resolveSosAlert = async (id, status = 'RESOLVED') => {
  const cfg = await getConfig();
  return axios.patch(`${API}/alerts/${id}/`, { status }, cfg);
};

export const deleteSosAlert = async (id) => {
  const cfg = await getConfig();
  return axios.delete(`${API}/alerts/${id}/`, cfg);
};

export const retrySosTranscription = async (id) => {
  const cfg = await getConfig();
  return axios.post(`${API}/${id}/transcribe/`, {}, cfg);
};
