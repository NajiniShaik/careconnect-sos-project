import axios from "axios";

const API = "http://127.0.0.1:8000/api/notifications";

function getAuthHeaders() {
  const token = localStorage.getItem("access");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getEscalationConfig() {
  return axios.get(`${API}/escalation-config/`, { headers: getAuthHeaders() });
}

export async function updateEscalationConfig(payload) {
  return axios.put(`${API}/escalation-config/`, payload, { headers: getAuthHeaders() });
}

export async function getEscalationLogs(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    query.append(key, String(value));
  });

  const queryString = query.toString();
  const url = queryString ? `${API}/escalation-logs/?${queryString}` : `${API}/escalation-logs/`;

  return axios.get(url, { headers: getAuthHeaders() });
}

export async function deleteEscalationLog(id) {
  return axios.delete(`${API}/escalation-logs/${id}/`, { headers: getAuthHeaders() });
}

export async function deleteAllEscalationLogs(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.append(key, String(value));
  });
  const queryString = query.toString();
  const url = queryString ? `${API}/escalation-logs/?${queryString}` : `${API}/escalation-logs/`;
  return axios.delete(url, { headers: getAuthHeaders() });
}
