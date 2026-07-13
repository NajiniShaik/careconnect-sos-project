import axios from "axios";

const API = "http://127.0.0.1:8000/api/users";

const authHeader = () => ({
    headers: {
        Authorization: `Bearer ${localStorage.getItem("access")}`,
    },
});

export const getEmergencyContacts = () =>
    axios.get(`${API}/emergency-contacts/`, authHeader());

export const createEmergencyContact = (data) =>
    axios.post(`${API}/emergency-contacts/`, data, authHeader());

export const updateEmergencyContact = (id, data) =>
    axios.put(`${API}/emergency-contacts/${id}/`, data, authHeader());

export const deleteEmergencyContact = (id) =>
    axios.delete(`${API}/emergency-contacts/${id}/`, authHeader());

export const verifyEmergencyContact = (id) =>
    axios.patch(
        `${API}/emergency-contacts/${id}/verify_contact/`,
        {},
        authHeader()
    );