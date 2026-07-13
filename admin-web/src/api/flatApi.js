import axios from "axios";

const API = "http://127.0.0.1:8000/api/society";

export const getFlats = () =>
  axios.get(`${API}/flats/`);

export const createFlat = (data) =>
  axios.post(`${API}/flats/`, data);

export const updateFlat = (id, data) =>
  axios.put(`${API}/flats/${id}/`, data);

export const deleteFlat = (id) =>
  axios.delete(`${API}/flats/${id}/`);