import axios from "axios";

const API = "http://127.0.0.1:8000/api/sos";

const getConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem("access")}`,
  },
});

export const getSosAlerts = () =>
  axios.get(`${API}/alerts/`, getConfig());

export const resolveSosAlert = (id, status = "RESOLVED") =>
  axios.patch(`${API}/alerts/${id}/`, { status }, getConfig());

export const deleteSosAlert = (id) =>
  axios.delete(`${API}/alerts/${id}/`, getConfig());
