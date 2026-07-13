import axios from "axios";

const API = "http://127.0.0.1:8000/api/society";

export const getBlocks = () =>
  axios.get(`${API}/blocks/`);

export const createBlock = (data) =>
  axios.post(`${API}/blocks/`, data);

export const updateBlock = (id, data) =>
  axios.put(`${API}/blocks/${id}/`, data);

export const deleteBlock = (id) =>
  axios.delete(`${API}/blocks/${id}/`);