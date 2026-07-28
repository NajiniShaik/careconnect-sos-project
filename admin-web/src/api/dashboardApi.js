import axios from "axios";

const API = "http://127.0.0.1:8000/api";

function parseJwt(token) {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(decoded)));
  } catch (e) {
    return null;
  }
}

async function tryRefresh() {
  const refresh = localStorage.getItem("refresh");
  if (!refresh) return false;

  try {
    const resp = await axios.post("http://127.0.0.1:8000/api/token/refresh/", { refresh });
    if (resp?.data?.access) {
      localStorage.setItem("access", resp.data.access);
      if (resp.data.refresh) localStorage.setItem("refresh", resp.data.refresh);
      return true;
    }
  } catch (e) {
    console.log("[dashboardApi] token refresh failed", e?.response?.status, e?.response?.data);
  }

  return false;
}

const getConfig = async () => {
  let token = localStorage.getItem("access");
  if (!token) {
    return {};
  }

  const payload = parseJwt(token);
  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && payload.exp <= now) {
    const refreshed = await tryRefresh();
    if (!refreshed) return {};
    token = localStorage.getItem("access");
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

export const getAlertDashboardOverview = async () => {
  const cfg = await getConfig();
  return axios.get(`${API}/sos/dashboard/overview/`, cfg);
};

export const getAlertDashboardRecentActivity = async (params = {}) => {
  const cfg = await getConfig();
  return axios.get(`${API}/sos/dashboard/recent-activity/`, { ...cfg, params });
};

export const getResponseMonitoringList = async (params = {}) => {
  const cfg = await getConfig();
  return axios.get(`${API}/sos/response-monitor/`, { ...cfg, params });
};

export const getNotificationDeliveryStatus = async (params = {}) => {
  const cfg = await getConfig();
  return axios.get(`${API}/notifications/delivery-status/`, { ...cfg, params });
};
