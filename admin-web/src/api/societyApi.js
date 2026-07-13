import axios from "axios";

const API = "http://127.0.0.1:8000/api/society";

export const getSocieties = (search = "", filter = "") =>
  axios.get(`${API}/societies/`, {
    params: {
      search,
      filter,
    },
  });

export const createSociety = (data) =>
  axios.post(`${API}/societies/`, data);

export const updateSociety = (id, data) =>
  axios.put(`${API}/societies/${id}/`, data);

export const deleteSociety = (id) =>
  axios.delete(`${API}/societies/${id}/`);

