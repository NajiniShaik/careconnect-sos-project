import axios from "axios";

const API = "http://127.0.0.1:8000/api/notifications";
const STORAGE_KEY = "cc_notification_templates_v1";

function getAuthHeaders() {
  const token = localStorage.getItem("access");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function defaultTemplates() {
  return [
    { key: "sos_created", name: "SOS Created", subject: "SOS Created: {{incident_id}}", email: "", sms: "", push_title: "SOS Created", push_message: "SOS reported by {{resident_name}}" },
    { key: "sos_escalated", name: "SOS Escalated", subject: "SOS Escalated: {{incident_id}}", email: "", sms: "", push_title: "SOS Escalated", push_message: "SOS escalated in {{society_name}}" },
    { key: "sos_resolved", name: "SOS Resolved", subject: "SOS Resolved: {{incident_id}}", email: "", sms: "", push_title: "SOS Resolved", push_message: "SOS resolved for {{resident_name}}" },
    { key: "resident_registered", name: "Resident Registered", subject: "Welcome to {{society_name}}", email: "", sms: "", push_title: "Welcome", push_message: "Welcome {{resident_name}}" },
    { key: "guardian_registered", name: "Guardian Registered", subject: "Guardian Registered", email: "", sms: "", push_title: "Guardian Registered", push_message: "Guardian {{guardian_name}} registered" },
    { key: "volunteer_assigned", name: "Volunteer Assigned", subject: "Volunteer Assigned", email: "", sms: "", push_title: "Volunteer Assigned", push_message: "{{volunteer_name}} assigned to incident {{incident_id}}" },
    { key: "security_alert", name: "Security Alert", subject: "Security Alert: {{category}}", email: "", sms: "", push_title: "Security Alert", push_message: "Security alert at {{address}}" },
    { key: "emergency_contact_verification", name: "Emergency Contact Verification", subject: "Emergency Contact Verification", email: "", sms: "", push_title: "Verify Contact", push_message: "Please verify emergency contact for {{resident_name}}" },
  ];
}

async function tryServerCall(fn) {
  try {
    const res = await fn();
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function listTemplates() {
  const server = await tryServerCall(() => axios.get(`${API}/templates/`, { headers: getAuthHeaders() }));
  if (server.ok) return server.data;

  // fallback to localStorage
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const defs = defaultTemplates();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defs));
    return defs;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    const defs = defaultTemplates();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defs));
    return defs;
  }
}

export async function saveTemplate(template) {
  // optimistic: try server, else persist locally
  const server = await tryServerCall(() => axios.put(`${API}/templates/${template.key}/`, template, { headers: getAuthHeaders() }));
  if (server.ok) return server.data;

  const list = await listTemplates();
  const next = list.map((t) => (t.key === template.key ? { ...t, ...template } : t));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return template;
}

export async function getTemplate(key) {
  const list = await listTemplates();
  return list.find((t) => t.key === key) || null;
}

export async function resetTemplates() {
  const defs = defaultTemplates();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defs));
  return defs;
}

const notificationTemplatesApi = { listTemplates, saveTemplate, getTemplate, resetTemplates };

export default notificationTemplatesApi;
