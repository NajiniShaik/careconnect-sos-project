import axios from "axios";

const API = "http://127.0.0.1:8000/api/notifications";

function getAuthHeaders() {
  const token = localStorage.getItem("access");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizeChannel(raw) {
  if (!raw) return "";
  if (Array.isArray(raw)) return String(raw[0] || "").toUpperCase();
  return String(raw).toUpperCase();
}

function mapBackendTemplate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const channel = normalizeChannel(raw.channel || raw.channels);
  const key = String(raw.template_key || raw.key || raw.templateKey || "").trim();
  const body = raw.body || "";
  const title = raw.title || "";
  return {
    ...raw,
    key,
    template_key: key,
    name: raw.name || "",
    subject: raw.subject || "",
    title,
    body,
    variables: Array.isArray(raw.variables) ? raw.variables : [],
    is_active: Boolean(raw.is_active),
    created_at: raw.created_at || raw.createdAt || null,
    updated_at: raw.updated_at || raw.updatedAt || null,
    channel,
    email: channel === "EMAIL" ? body : raw.email || "",
    sms: channel === "SMS" ? body : raw.sms || "",
    push_title: channel === "PUSH" ? title : raw.push_title || "",
    push_message: channel === "PUSH" ? body : raw.push_message || "",
  };
}

function normalizeTemplatePayload(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw?.results && Array.isArray(raw.results)) list = raw.results;
  else if (raw?.templates && Array.isArray(raw.templates)) list = raw.templates;
  else if (raw?.data && Array.isArray(raw.data)) list = raw.data;
  else if (raw?.data?.results && Array.isArray(raw.data.results)) list = raw.data.results;
  else if (raw?.data?.templates && Array.isArray(raw.data.templates)) list = raw.data.templates;
  return list.map(mapBackendTemplate).filter(Boolean);
}

function buildSavePayload(template) {
  const key = String(template.template_key || template.key || template.templateKey || "").trim();
  const name = String(template.name || "").trim();
  const subject = String(template.subject || "").trim();
  const email = String(template.email || "").trim();
  const sms = String(template.sms || "").trim();
  const push_title = String(template.push_title || template.pushTitle || "").trim();
  const push_message = String(template.push_message || template.pushMessage || "").trim();
  const title = String(template.title || "").trim();
  const channel = email ? "EMAIL" : sms ? "SMS" : push_message ? "PUSH" : normalizeChannel(template.channel || template.channels) || "EMAIL";
  const payload = {
    template_key: key,
    name,
    subject,
    channel,
    title: channel === "PUSH" ? push_title : title,
    body: channel === "EMAIL" ? email : channel === "SMS" ? sms : push_message,
    variables: Array.isArray(template.variables) ? template.variables : [],
    is_active: template.is_active !== false,
  };
  if (channel !== "PUSH") delete payload.title;
  return payload;
}

export async function listTemplates() {
  const url = `${API}/templates/`;
  const res = await axios.get(url, { headers: getAuthHeaders() });
  return normalizeTemplatePayload(res.data);
}

export async function saveTemplate(template) {
  const key = String(template.template_key || template.key || template.templateKey || "").trim();
  const url = `${API}/templates/${encodeURIComponent(key)}/`;
  const payload = buildSavePayload(template);
  try {
    const res = await axios.put(url, payload, { headers: getAuthHeaders() });
    return mapBackendTemplate(res.data);
  } catch (err) {
    // If the template doesn't exist, backend returns 404 for PUT. Try creating via POST.
    if (err?.response?.status === 404) {
      const listUrl = `${API}/templates/`;
      const res2 = await axios.post(listUrl, payload, { headers: getAuthHeaders() });
      return mapBackendTemplate(res2.data);
    }
    throw err;
  }
}

export async function getTemplate(key) {
  const url = `${API}/templates/${encodeURIComponent(key)}/`;
  const res = await axios.get(url, { headers: getAuthHeaders() });
  return mapBackendTemplate(res.data);
}

export async function deleteTemplate(key) {
  const url = `${API}/templates/${encodeURIComponent(key)}/`;
  const res = await axios.delete(url, { headers: getAuthHeaders() });
  return res.data;
}

export async function resetTemplates() {
  const url = `${API}/templates/reset/`;
  const res = await axios.post(url, {}, { headers: getAuthHeaders() });
  return normalizeTemplatePayload(res.data);
}

const notificationTemplatesApi = { listTemplates, saveTemplate, getTemplate, deleteTemplate, resetTemplates };

export default notificationTemplatesApi;
