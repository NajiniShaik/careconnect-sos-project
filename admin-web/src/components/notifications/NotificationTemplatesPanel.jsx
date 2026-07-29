import { useEffect, useMemo, useState } from "react";
import Button from "../common/Button";
import Modal from "../common/Modal";
import { listTemplates, saveTemplate, deleteTemplate, resetTemplates } from "../../api/notificationTemplatesApi";

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

function getTemplateType(template) {
  if (!template) return "General";
  const key = String(template.key || template.template_key || template.templateKey || "").toLowerCase();
  if (key.includes("sos")) return "SOS";
  if (key.includes("resident")) return "Resident";
  if (key.includes("guardian")) return "Guardian";
  if (key.includes("volunteer")) return "Volunteer";
  if (key.includes("security")) return "Security";
  if (key.includes("emergency_contact")) return "Emergency";
  return "General";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function hasChannel(template, channel) {
  if (!template) return false;
  if (channel === "push") return Boolean(template.push_title || template.push_message);
  return Boolean(template[channel]);
}

function validate(form) {
  const errors = {};
  if (!form || !String(form.name || "").trim()) errors.name = "Template name is required";
  if (form && String(form.name || "").length > 100) errors.name = "Max 100 characters";
  if (form && String(form.subject || "").length > 150) errors.subject = "Max 150 characters";
  if (form && String(form.sms || "").length > 320) errors.sms = "Max 320 characters";
  if (form && String(form.push_title || "").length > 80) errors.push_title = "Max 80 characters";
  if (form && String(form.push_message || "").length > 250) errors.push_message = "Max 250 characters";
  return errors;
}

function deriveTemplateKey(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || `template_${Date.now()}`;
}

export default function NotificationTemplatesPanel({ createTemplateSignal }) {
  const [templates, setTemplates] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [form, setForm] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!selectedKey && !isCreating) {
      setForm(null);
      return;
    }

    if (selectedKey) {
      const selected = templates.find((item) => item.key === selectedKey || item.template_key === selectedKey);
      setForm(selected ? { ...selected } : null);
    }
  }, [selectedKey, templates, isCreating]);

  const [lastCreateSignal, setLastCreateSignal] = useState(0);

  useEffect(() => {
    if (createTemplateSignal > 0 && createTemplateSignal !== lastCreateSignal) {
      setLastCreateSignal(createTemplateSignal);
      openCreateModal();
    }
  }, [createTemplateSignal, lastCreateSignal]);

  const loadTemplates = async () => {
    console.log("[Templates] loadTemplates start");
    setLoading(true);
    setNotification(null);
    try {
      const list = await listTemplates();
      console.log("[Templates] loadTemplates received", list);
      setTemplates(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Failed to load templates", err);
      setNotification({ type: "error", message: "Unable to load templates." });
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form) return;
    const errors = validate(form);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setNotification(null);
    try {
      const payload = { ...form };
      if (!payload.key || !String(payload.key).trim()) {
        payload.key = deriveTemplateKey(payload.name);
      }
      payload.template_key = String(payload.template_key || payload.key || "").trim();
      await saveTemplate(payload);
      setNotification({ type: "success", message: "Template saved." });
      if (isCreating) {
        setSelectedKey(payload.template_key);
        setIsCreating(false);
      }
      await loadTemplates();
    } catch (err) {
      console.error("Failed to save template", err);
      setNotification({ type: "error", message: "Unable to save template." });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedKey && !isCreating) return;

    setSaving(true);
    setNotification(null);
    try {
      const defaults = await resetTemplates();
      setTemplates(defaults);
      if (isCreating) {
        setForm({ key: "", template_key: "", name: "", subject: "", email: "", sms: "", push_title: "", push_message: "" });
      } else {
        const selected = defaults.find((item) => item.key === selectedKey || item.template_key === selectedKey);
        setForm(selected ? { ...selected } : null);
      }
      setNotification({ type: "success", message: "Template reset to defaults." });
    } catch (err) {
      console.error("Failed reset", err);
      setNotification({ type: "error", message: "Unable to reset template." });
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = () => {
    setIsCreating(true);
    setSelectedKey("");
    setForm({ key: "", name: "", subject: "", email: "", sms: "", push_title: "", push_message: "" });
    setIsModalOpen(true);
  };

  const deleteSelectedTemplate = async (key) => {
    const confirmed = window.confirm("Delete this template? This action cannot be undone.");
    if (!confirmed) return;

    setLoading(true);
    setNotification(null);
    try {
      await deleteTemplate(key);
      const remaining = templates.filter((item) => item.key !== key && item.template_key !== key);
      setTemplates(remaining);
      if (selectedKey === key) {
        setSelectedKey(remaining[0]?.key || remaining[0]?.template_key || "");
        setForm(null);
      }
      setNotification({ type: "success", message: "Template deleted." });
    } catch (err) {
      console.error("Failed to delete template", err);
      setNotification({ type: "error", message: "Unable to delete template." });
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setIsCreating(false);
    if (selectedKey) {
      const selected = templates.find((item) => item.key === selectedKey);
      setForm(selected ? { ...selected } : null);
    }
    setIsModalOpen(false);
  };

  const filteredTemplates = useMemo(() => {
    if (filter === "all") return templates;
    return templates.filter((item) => {
      if (filter === "email") return hasChannel(item, "email");
      if (filter === "sms") return hasChannel(item, "sms");
      if (filter === "push") return hasChannel(item, "push");
      return true;
    });
  }, [templates, filter]);

  useEffect(() => {
    if (!selectedKey && filteredTemplates.length > 0 && !isCreating) {
      setSelectedKey(filteredTemplates[0].key);
    }
    if (selectedKey && !filteredTemplates.some((item) => item.key === selectedKey) && !isCreating) {
      setSelectedKey(filteredTemplates[0]?.key || "");
    }
  }, [filteredTemplates, selectedKey, isCreating]);

  const errors = validate(form);
  const isValid = Object.keys(errors).length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setFilter("all")}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              background: filter === "all" ? "var(--chip-bg)" : "var(--surface-muted)",
              color: filter === "all" ? "var(--chip-text)" : "var(--text)",
              padding: "10px 18px",
              cursor: "pointer",
              fontWeight: filter === "all" ? 700 : 600,
            }}
          >
            All Templates
          </button>
          <button
            type="button"
            onClick={() => setFilter("email")}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              background: filter === "email" ? "var(--chip-bg)" : "var(--surface-muted)",
              color: filter === "email" ? "var(--chip-text)" : "var(--text)",
              padding: "10px 18px",
              cursor: "pointer",
              fontWeight: filter === "email" ? 700 : 600,
            }}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setFilter("sms")}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              background: filter === "sms" ? "var(--chip-bg)" : "var(--surface-muted)",
              color: filter === "sms" ? "var(--chip-text)" : "var(--text)",
              padding: "10px 18px",
              cursor: "pointer",
              fontWeight: filter === "sms" ? 700 : 600,
            }}
          >
            SMS
          </button>
          <button
            type="button"
            onClick={() => setFilter("push")}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              background: filter === "push" ? "var(--chip-bg)" : "var(--surface-muted)",
              color: filter === "push" ? "var(--chip-text)" : "var(--text)",
              padding: "10px 18px",
              cursor: "pointer",
              fontWeight: filter === "push" ? 700 : 600,
            }}
          >
            Push
          </button>
        </div>
      </div>

      {notification ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 14,
            background: notification.type === "error" ? "rgba(254, 226, 226, 0.85)" : "rgba(220, 252, 231, 0.9)",
            border: notification.type === "error" ? "1px solid #fecaca" : "1px solid #bbf7d0",
            color: notification.type === "error" ? "#991b1b" : "#166534",
          }}
        >
          {notification.message}
        </div>
      ) : null}

      <div style={{ minHeight: 580 }}>
        <div className="glass-panel" style={{ borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--surface-glass)", border: "1px solid var(--glass-border)" }}>
          <div style={{ padding: 18, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Template library</div>
              <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted)" }}>{filteredTemplates.length} templates shown</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>{loading ? "Refreshing…" : ""}</div>
          </div>

          <div style={{ overflowX: "auto", flex: 1 }}>
            <div style={{ minWidth: 780 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 2.4fr 1fr 1fr", gap: 12, padding: "16px 18px", fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                <div>Template</div>
                <div>Type</div>
                <div>Channels</div>
                <div>Subject / title</div>
                <div>Updated</div>
                <div>Action</div>
              </div>

              {loading ? (
                <div style={{ padding: 18, color: "var(--muted)" }}>Loading templates…</div>
              ) : filteredTemplates.length === 0 ? (
                <div style={{ padding: 18, color: "var(--muted)" }}>No templates match this filter.</div>
              ) : (
                filteredTemplates.map((item) => {
                  const selected = item.key === selectedKey;
                  return (
                    <div
                      key={item.key}
                      onClick={() => setSelectedKey(item.key)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2.2fr 1fr 1fr 2.4fr 1fr 1fr",
                        gap: 12,
                        alignItems: "center",
                        padding: "16px 18px",
                        borderTop: "1px solid var(--border)",
                        background: selected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{item.name}</div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>{item.key}</div>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text)" }}>{getTemplateType(item)}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: hasChannel(item, "email") ? "var(--chip-bg)" : "var(--surface-muted)", color: hasChannel(item, "email") ? "var(--chip-text)" : "var(--text-muted)" }}>Email</span>
                        <span style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: hasChannel(item, "sms") ? "var(--chip-bg)" : "var(--surface-muted)", color: hasChannel(item, "sms") ? "var(--chip-text)" : "var(--text-muted)" }}>SMS</span>
                        <span style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: hasChannel(item, "push") ? "var(--chip-bg)" : "var(--surface-muted)", color: hasChannel(item, "push") ? "var(--chip-text)" : "var(--text-muted)" }}>Push</span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.subject || item.push_title || "—"}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>{formatDate(item.updated_at || item.updatedAt || item.last_modified)}</div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedKey(item.key);
                            setIsCreating(false);
                            setIsModalOpen(true);
                          }}
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 999,
                            background: selected ? "rgba(37, 99, 235, 0.16)" : "var(--surface-muted)",
                            color: selected ? "var(--primary)" : "var(--text)",
                            padding: "8px 12px",
                            cursor: "pointer",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>✏️</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSelectedTemplate(item.key);
                          }}
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 999,
                            background: "rgba(239, 68, 68, 0.14)",
                            color: "#fda4af",
                            padding: "8px 12px",
                            cursor: "pointer",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>🗑️</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        </div>

      <Modal isOpen={isModalOpen} title={isCreating ? "New template" : form ? `Edit template: ${form.name}` : "Edit template"} onClose={closeModal}>
        {form ? (
          <div style={{ display: "grid", gap: 18, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Template name</label>
                <input
                  value={form.name || ""}
                  onChange={(e) => handleChange("name", e.target.value)}
                  style={{ width: "100%", borderRadius: 14, border: "1px solid var(--border)", padding: 12, background: "var(--input-bg)", color: "var(--input-text)" }}
                />
                {errors.name ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.name}</div> : null}
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Template type</label>
                <div style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-muted)", color: "var(--text)", fontWeight: 700 }}>
                  {getTemplateType(form)}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Subject</label>
                <input
                  value={form.subject || ""}
                  onChange={(e) => handleChange("subject", e.target.value)}
                  style={{ width: "100%", borderRadius: 14, border: "1px solid var(--border)", padding: 12, background: "var(--input-bg)", color: "var(--input-text)" }}
                />
                {errors.subject ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.subject}</div> : null}
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Email template</label>
                <textarea
                  value={form.email || ""}
                  onChange={(e) => handleChange("email", e.target.value)}
                  style={{ width: "100%", minHeight: 120, borderRadius: 14, border: "1px solid var(--border)", padding: 12, resize: "vertical", background: "var(--input-bg)", color: "var(--input-text)" }}
                />
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>SMS template</label>
                  <textarea
                    value={form.sms || ""}
                    onChange={(e) => handleChange("sms", e.target.value)}
                    style={{ width: "100%", minHeight: 100, borderRadius: 14, border: "1px solid var(--border)", padding: 12, resize: "vertical", background: "var(--input-bg)", color: "var(--input-text)" }}
                  />
                  {errors.sms ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.sms}</div> : null}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Push title</label>
                  <input
                    value={form.push_title || ""}
                    onChange={(e) => handleChange("push_title", e.target.value)}
                    style={{ width: "100%", borderRadius: 14, border: "1px solid var(--border)", padding: 12, background: "var(--input-bg)", color: "var(--input-text)" }}
                  />
                  {errors.push_title ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.push_title}</div> : null}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Push message</label>
                  <textarea
                    value={form.push_message || ""}
                    onChange={(e) => handleChange("push_message", e.target.value)}
                    style={{ width: "100%", minHeight: 100, borderRadius: 14, border: "1px solid var(--border)", padding: 12, resize: "vertical", background: "var(--input-bg)", color: "var(--input-text)" }}
                  />
                  {errors.push_message ? <div style={{ color: "#dc2626", marginTop: 6 }}>{errors.push_message}</div> : null}
                </div>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Channels</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "Email", active: hasChannel(form, "email") },
                    { label: "SMS", active: hasChannel(form, "sms") },
                    { label: "Push", active: hasChannel(form, "push") },
                  ].map((channel) => (
                    <div key={channel.label} style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: channel.active ? "var(--chip-bg)" : "var(--surface-muted)", fontSize: 12, color: channel.active ? "var(--chip-text)" : "var(--muted)" }}>
                      {channel.label}: {channel.active ? "Enabled" : "Disabled"}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 16, borderRadius: 18, background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Placeholders</div>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PLACEHOLDERS.map((placeholder) => (
                    <div key={placeholder} style={{ background: "var(--surface-muted)", border: "1px solid var(--border)", padding: "8px 10px", borderRadius: 999, fontSize: 12, color: "var(--text)" }}>
                      {placeholder}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Button onClick={handleSave} disabled={!isValid || saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button variant="secondary" onClick={handleReset} disabled={saving}>
                  Reset defaults
                </Button>
                <Button variant="secondary" onClick={closeModal}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 18 }}>Loading…</div>
        )}
      </Modal>
    </div>
  );
}

