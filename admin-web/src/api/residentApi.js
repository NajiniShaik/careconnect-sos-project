import axios from "axios";

const API = "http://127.0.0.1:8000/api/users";

const getConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem("access")}`,
  },
});

export const getResidents = (params = {}) =>
  axios.get(`${API}/resident-profiles/`, {
    params,
    ...getConfig(),
  });

export const createResident = (data) =>
  axios.post(`${API}/register/resident/`, data, getConfig());

export const updateResident = (id, data) =>
  axios.put(`${API}/resident-profiles/${id}/`, data, getConfig());

export const deleteResident = (id) =>
  axios.delete(`${API}/resident-profiles/${id}/`, getConfig());

export const approveResident = (id) =>
  axios.patch(`${API}/resident-profiles/${id}/approve/`, {}, getConfig());

export const rejectResident = (id) =>
  axios.patch(`${API}/resident-profiles/${id}/reject/`, {}, getConfig());

