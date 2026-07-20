import { useEffect, useState } from "react";
import AdminLayout from "../components/common/AdminLayout";
import PageTitle from "../components/common/PageTitle";
import Modal from "../components/common/Modal";
import Button from "../components/common/Button";
import { listTemplates, getTemplate, saveTemplate, resetTemplates } from "../api/notificationTemplatesApi";

const PLACEHOLDERS = [
  "{{resident_name}}",
  "{{guardian_name}}",
  "{{volunteer_name}}",
  "{{society_name}}",
  "{{flat_number}}",
  "{{category}}",
  "{{severity}}",
  "{{address}}",
  "{{incident_id}}",
  "{{created_at}}",
];

const SAMPLE_VALUES = {
  resident_name: "Asha Sharma",
  guardian_name: "Ramesh Sharma",
  volunteer_name: "Sunil Kumar",
  society_name: "Green Meadows",
  flat_number: "B-102",
  category: "Medical",
  severity: "High",
  address: "Tower B, Green Meadows",
  incident_id: "INC-2026-0001",
  created_at: new Date().toLocaleString(),
};

function renderPreview(template) {
  if (!template) return { email: "", sms: "", pushTitle: "", pushMessage: "" };

  const map = (text = "") =>
    String(text).replace(/{{(\w+)}}/g, (_, name) => SAMPLE_VALUES[name] ?? "—");

  return {
    email: map(template.email),
    sms: map(template.sms),
    pushTitle: map(template.push_title),
    pushMessage: map(template.push_message),
  };
}

export default function NotificationTemplates() {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    void loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const list = await listTemplates();
      setTemplates(list || []);
      setNotification(null);
    } catch (err) {
      console.error("Failed to load templates", err);
      setNotification({ type: "error", message: "Unable to load templates." });
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const openTemplate = async (key) => {
    setSelected(key);
    setNotification(null);
    setForm(null);
    try {
      const t = await getTemplate(key);
      setForm({ ...t });
    } catch (err) {
      console.error("Failed to load template", err);
      setNotification({ type: "error", message: "Unable to open template." });
      setForm(null);
    }
  };

  const validate = (f) => {
    const errors = {};
    if (!f || !String(f.name || "").trim()) errors.name = "Template name is required";
    if (f && String(f.name || "").length > 100) errors.name = "Max 100 characters";
    if (f && String(f.subject || "").length > 150) errors.subject = "Max 150 characters";
    if (f && String(f.sms || "").length > 320) errors.sms = "Max 320 characters";
    if (f && String(f.push_title || "").length > 80) errors.push_title = "Max 80 characters";
    if (f && String(f.push_message || "").length > 250) errors.push_message = "Max 250 characters";
    return errors;
  };

  const errors = validate(form);
  const isValid = Object.keys(errors).length === 0;

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!isValid || !form) return;
    setSaving(true);
    setNotification(null);
    try {
      await saveTemplate(form);
      setNotification({ type: "success", message: "Template saved." });
      // refresh masters
      await loadTemplates();
      setSelected(null);
    } catch (err) {
      console.error("Failed to save", err);
      setNotification({ type: "error", message: "Unable to save template." });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    setSaving(true);
    setNotification(null);
    try {
      const defs = await resetTemplates();
      setTemplates(defs);
      const t = await getTemplate(selected);
      setForm({ ...t });
      setNotification({ type: "success", message: "Template reset to defaults." });
    } catch (err) {
      console.error("Failed reset", err);
      setNotification({ type: "error", message: "Unable to reset template." });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSelected(null);
    setForm(null);
    setNotification(null);
  };

  const preview = renderPreview(form);

  return (
    <AdminLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <PageTitle title="Notification Templates" />

        {notification ? (
          <div style={{ padding: "10px 12px", background: notification.type === "error" ? "rgba(254, 226, 226, 0.8)" : "rgba(220, 252, 231, 0.85)", borderRadius: 12 }}>
            {notification.message}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {loading ? (
            <div style={{ gridColumn: "1/-1", padding: 12 }}>Loading templates…</div>
          ) : (
            templates.map((t) => (
              <div key={t.key} onClick={() => openTemplate(t.key)} style={{ background: "#fff", borderRadius: 12, padding: 14, cursor: "pointer", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
                <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 700 }}>{t.name}</div>
                <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>{t.subject || "—"}</div>
              </div>
            ))
          )}
        </div>

        <Modal isOpen={!!selected} title={form ? `Edit: ${form.name}` : "Loading..."} onClose={handleCancel}>
          {form ? (
            <div style={{ display: "flex", gap: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Template Name</label>
                  <input value={form.name || ""} onChange={(e) => handleChange("name", e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 6 }} />
                  {errors.name ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.name}</div> : null}
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Subject</label>
                  <input value={form.subject || ""} onChange={(e) => handleChange("subject", e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 6 }} />
                  {errors.subject ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.subject}</div> : null}
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700 }}>Email Template (HTML/text)</label>
                  <textarea value={form.email || ""} onChange={(e) => handleChange("email", e.target.value)} style={{ width: "100%", minHeight: 160, padding: 10, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 6 }} />
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>SMS Template</label>
                    <textarea value={form.sms || ""} onChange={(e) => handleChange("sms", e.target.value)} style={{ width: "100%", minHeight: 100, padding: 10, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 6 }} />
                    {errors.sms ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.sms}</div> : null}
                  </div>

                  <div style={{ width: 220 }}>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Push Title</label>
                    <input value={form.push_title || ""} onChange={(e) => handleChange("push_title", e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 6 }} />
                    {errors.push_title ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.push_title}</div> : null}

                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 13, fontWeight: 700 }}>Push Message</label>
                      <textarea value={form.push_message || ""} onChange={(e) => handleChange("push_message", e.target.value)} style={{ width: "100%", minHeight: 84, padding: 10, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 6 }} />
                      {errors.push_message ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.push_message}</div> : null}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button onClick={handleSave} disabled={!isValid || saving}>
                    {saving ? "Saving…" : "Save"}
                  </Button>

                  <Button variant="secondary" onClick={handleReset} disabled={saving}>
                    {saving ? "…" : "Reset"}
                  </Button>

                  <button onClick={handleCancel} style={{ border: "none", background: "transparent", color: "#475569", cursor: "pointer", padding: "10px 12px", borderRadius: 10 }}>
                    Cancel
                  </button>
                </div>
              </div>

              <div style={{ width: 320 }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Placeholders</div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
                    Use these placeholders in any template field:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {PLACEHOLDERS.map((p) => (
                      <div key={p} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "6px 8px", borderRadius: 8, fontSize: 13 }}>{p}</div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Live Preview</div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>Email preview</div>
                  <div style={{ marginTop: 8, minHeight: 80, padding: 10, background: "#fff", border: "1px solid #e6eef8", borderRadius: 8 }}>{preview.email}</div>

                  <div style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>SMS preview</div>
                  <div style={{ marginTop: 8, minHeight: 60, padding: 10, background: "#fff", border: "1px solid #e6eef8", borderRadius: 8 }}>{preview.sms}</div>

                  <div style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>Push preview</div>
                  <div style={{ marginTop: 8, padding: 10, background: "#fff", border: "1px solid #e6eef8", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700 }}>{preview.pushTitle}</div>
                    <div style={{ marginTop: 6 }}>{preview.pushMessage}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>Loading template…</div>
          )}
        </Modal>
      </div>
    </AdminLayout>
  );
}
