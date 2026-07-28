import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../components/common/AdminLayout";
import PageTitle from "../components/common/PageTitle";
import { getEscalationConfig, updateEscalationConfig } from "../api/escalationApi";

const initialForm = {
  response_timeout_minutes: 5,
  escalation_enabled: true,
  escalate_to_secondary_guardian: true,
  escalate_to_emergency_contacts: true,
};

const toggleStyle = (checked) => ({
  position: "relative",
  width: 48,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: checked ? "#2563eb" : "#cbd5e1",
  cursor: "pointer",
  transition: "background 0.2s ease",
  padding: 0,
});

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      style={{
        ...toggleStyle(checked),
        opacity: disabled ? 0.7 : 1,
      }}
      aria-pressed={checked}
    >
      <span
        style={{
          display: "block",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          transform: checked ? "translateX(22px)" : "translateX(2px)",
          transition: "transform 0.2s ease",
          margin: "3px",
        }}
      />
    </button>
  );
}

export default function GuardianEscalationSettings() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadConfig = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await getEscalationConfig();
        if (mounted) {
          setForm({
            response_timeout_minutes: response?.data?.response_timeout_minutes ?? 5,
            escalation_enabled: response?.data?.escalation_enabled ?? true,
            escalate_to_secondary_guardian: response?.data?.escalate_to_secondary_guardian ?? true,
            escalate_to_emergency_contacts: response?.data?.escalate_to_emergency_contacts ?? true,
          });
        }
      } catch (err) {
        if (mounted) {
          setError(err?.response?.data?.detail || err?.response?.data?.message || "Unable to load escalation settings.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadConfig();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const validationError = useMemo(() => {
    if (!Number.isFinite(Number(form.response_timeout_minutes)) || Number(form.response_timeout_minutes) <= 0) {
      return "Response timeout must be greater than 0.";
    }
    return "";
  }, [form.response_timeout_minutes]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    setToast(null);

    try {
      const payload = {
        response_timeout_minutes: Number(form.response_timeout_minutes),
        escalation_enabled: Boolean(form.escalation_enabled),
        escalate_to_secondary_guardian: Boolean(form.escalate_to_secondary_guardian),
        escalate_to_emergency_contacts: Boolean(form.escalate_to_emergency_contacts),
      };

      const response = await updateEscalationConfig(payload);
      setForm({
        response_timeout_minutes: response?.data?.response_timeout_minutes ?? payload.response_timeout_minutes,
        escalation_enabled: response?.data?.escalation_enabled ?? payload.escalation_enabled,
        escalate_to_secondary_guardian: response?.data?.escalate_to_secondary_guardian ?? payload.escalate_to_secondary_guardian,
        escalate_to_emergency_contacts: response?.data?.escalate_to_emergency_contacts ?? payload.escalate_to_emergency_contacts,
      });
      setSuccess("Guardian escalation settings saved successfully.");
      setToast({ type: "success", message: "Guardian escalation settings saved successfully." });
    } catch (err) {
      const serverMessage = err?.response?.data;
      const message = typeof serverMessage === "string"
        ? serverMessage
        : serverMessage?.detail || serverMessage?.message || Object.values(serverMessage || {}).flat().join(" ") || "Unable to save escalation settings.";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <PageTitle title="Guardian Escalation" />

        <div style={{ background: "var(--surface)", borderRadius: 18, padding: 24, border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
          <div style={{ marginBottom: 18, color: "var(--muted)" }}>
            Configure how SOS alerts escalate to guardians and emergency contacts.
          </div>

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #cbd5e1", borderTopColor: "#2563eb", animation: "spin 0.8s linear infinite" }} />
              Loading settings…
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {error ? (
                <div style={{ padding: 12, borderRadius: 12, background: "rgba(239,68,68,0.08)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</div>
              ) : null}

              {success ? (
                <div style={{ padding: 12, borderRadius: 12, background: "rgba(22,163,74,0.08)", color: "var(--success)", border: "1px solid rgba(22,163,74,0.2)" }}>{success}</div>
              ) : null}

              {toast ? (
                <div
                  style={{
                    position: "fixed",
                    top: 24,
                    right: 24,
                    zIndex: 1000,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: toast.type === "error" ? "rgba(239,68,68,0.95)" : "rgba(22,163,74,0.95)",
                    color: "#fff",
                    boxShadow: "0 10px 24px rgba(15,23,42,0.18)",
                    maxWidth: 320,
                  }}
                >
                  {toast.message}
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>Response Timeout (minutes)</span>
                  <input
                    type="number"
                    min="1"
                    value={form.response_timeout_minutes}
                    onChange={(event) => setForm({ ...form, response_timeout_minutes: event.target.value })}
                    style={{ padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}
                  />
                  {validationError ? <span style={{ color: "var(--danger)", fontSize: 13 }}>{validationError}</span> : null}
                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center", padding: "14px", borderRadius: 14, background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>Enable Auto Escalation</span>
                    <Toggle checked={Boolean(form.escalation_enabled)} onChange={(value) => setForm({ ...form, escalation_enabled: value })} disabled={saving} />
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Turn the periodic guardian escalation workflow on or off.</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center", padding: "14px", borderRadius: 14, background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>Escalate to Secondary Guardian</span>
                    <Toggle checked={Boolean(form.escalate_to_secondary_guardian)} onChange={(value) => setForm({ ...form, escalate_to_secondary_guardian: value })} disabled={saving} />
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Send the escalation to a secondary guardian when the timeout is reached.</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center", padding: "14px", borderRadius: 14, background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>Escalate to Emergency Contacts</span>
                    <Toggle checked={Boolean(form.escalate_to_emergency_contacts)} onChange={(value) => setForm({ ...form, escalate_to_emergency_contacts: value })} disabled={saving} />
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Notify emergency contacts if the escalation path is enabled.</div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={saving || Boolean(validationError)}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    background: saving || Boolean(validationError) ? "var(--muted)" : "linear-gradient(135deg, var(--primary) 0%, #1d4ed8 100%)",
                    color: "#fff",
                    padding: "12px 20px",
                    cursor: saving || Boolean(validationError) ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  {saving ? (
                    <>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.6)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                      Saving…
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
