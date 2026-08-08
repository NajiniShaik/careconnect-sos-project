import axios from "axios";

const API = "http://127.0.0.1:8000/api/sos";

function getAuthHeaders() {
  const token = localStorage.getItem("access");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const getReporting = (params = {}) =>
  axios.get(`${API}/reporting/`, {
    params,
    headers: getAuthHeaders(),
  });

export const downloadReportingExcel = async (params = {}) => {
  const response = await axios.get(`${API}/reporting/export/excel/`, {
    params,
    headers: getAuthHeaders(),
    responseType: "blob",
  });
  return response.data;
};

export const downloadReportingPdf = async (params = {}) => {
  const response = await axios.get(`${API}/reporting/export/pdf/`, {
    params,
    headers: getAuthHeaders(),
    responseType: "blob",
  });
  return response.data;
};
