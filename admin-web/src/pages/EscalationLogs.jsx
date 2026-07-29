/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../components/common/AdminLayout";
import PageTitle from "../components/common/PageTitle";
import { getEscalationLogs, deleteEscalationLog, deleteAllEscalationLogs } from "../api/escalationApi";
import ConfirmDialog from "../components/common/ConfirmDialog";

const levelOptions = [
  { value: "", label: "All Levels" },
  { value: "SECONDARY_GUARDIAN", label: "Secondary Guardian" },
  { value: "EMERGENCY_CONTACT", label: "Emergency Contact" },
];

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getResidentLabel(log) {
  const resident = log?.recipient_user || log?.resident || null;
  const name = resident?.username || resident?.name || resident?.email || "Unknown";
  return name;
}

export default function EscalationLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ count: 0, next: null, previous: null });
  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmAction, setConfirmAction] = useState(() => null);
  const [, setConfirmLoading] = useState(false);

  const loadLogs = useCallback(async (nextPage = 1) => {
    setLoading(true);
    setError("");
    try {
      const response = await getEscalationLogs({
        page: nextPage,
        page_size: pageSize,
        sos: search.trim(),
        escalation_level: levelFilter,
      });
      const data = response?.data || {};
      setLogs(Array.isArray(data?.results) ? data.results : []);
      setPagination({
        count: Number(data?.count || 0),
        next: data?.next || null,
        previous: data?.previous || null,
      });
      setPage(nextPage);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.response?.data?.message || "Unable to load escalation logs.");
      setLogs([]);
      setPagination({ count: 0, next: null, previous: null });
    } finally {
      setLoading(false);
    }
  }, [levelFilter, pageSize, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLogs(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [levelFilter, loadLogs, pageSize, search]);

  const filteredLogs = useMemo(() => {
    const query = search.toLowerCase();
    return logs.filter((log) => {
      const sosMatch = String(log?.sos || "").includes(query);
      const residentMatch = String(getResidentLabel(log)).toLowerCase().includes(query);
      const levelMatch = !levelFilter || log?.escalation_level === levelFilter;
      return (sosMatch || residentMatch) && levelMatch;
    });
  }, [logs, search, levelFilter]);

  const totalPages = Math.max(1, Math.ceil(pagination.count / pageSize));

  const handleSearch = (event) => {
    setSearch(event.target.value);
  };

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openDeleteConfirm = (log) => {
    setConfirmTitle("Delete Escalation Log");
    setConfirmMessage("Are you sure you want to delete this escalation log?");
    setConfirmAction(() => async () => {
      setConfirmLoading(true);
      try {
        await deleteEscalationLog(log.id);
        setLogs((prev) => prev.filter((l) => l.id !== log.id));
        setPagination((p) => ({ ...p, count: Math.max(0, (p.count || 0) - 1) }));
        setToast({ type: "success", message: "Escalation log deleted." });
      } catch (err) {
        const message = err?.response?.data?.detail || err?.response?.data?.message || "Unable to delete escalation log.";
        setToast({ type: "error", message });
      } finally {
        setConfirmLoading(false);
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const openDeleteAllConfirm = () => {
    setConfirmTitle("Delete All Escalation Logs");
    setConfirmMessage("This will permanently delete ALL escalation logs. This action cannot be undone.");
    setConfirmAction(() => async () => {
      setConfirmLoading(true);
      try {
        await deleteAllEscalationLogs();
        // reload first page
        await loadLogs(1);
        setToast({ type: "success", message: "All escalation logs deleted." });
      } catch (err) {
        const message = err?.response?.data?.detail || err?.response?.data?.message || "Unable to delete escalation logs.";
        setToast({ type: "error", message });
      } finally {
        setConfirmLoading(false);
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  return (
    <AdminLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <PageTitle title="Escalation Logs" />

        <div style={{ background: "var(--surface)", borderRadius: 18, padding: 20, border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flex: 1 }}>
              <input
                type="text"
                value={search}
                onChange={handleSearch}
                placeholder="Search by SOS ID or resident"
                style={{ minWidth: 260, flex: 1, padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)" }}
              />
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
                style={{ padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)" }}
              >
                {levelOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ color: "var(--muted)", fontWeight: 600 }}>Rows</label>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)" }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <button
                type="button"
                onClick={openDeleteAllConfirm}
                disabled={pagination.count === 0}
                style={{ marginLeft: 8, border: "none", background: pagination.count === 0 ? "#fee2e2" : "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)", color: pagination.count === 0 ? "#fca5a5" : "#fff", padding: "10px 14px", borderRadius: 12, cursor: pagination.count === 0 ? "not-allowed" : "pointer", fontWeight: 700 }}
              >
                Delete All Logs
              </button>
            </div>
          </div>

          {error ? (
            <div style={{ padding: 12, borderRadius: 12, background: "rgba(239,68,68,0.08)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.2)", marginBottom: 14 }}>{error}</div>
          ) : null}

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #cbd5e1", borderTopColor: "#2563eb", animation: "spin 0.8s linear infinite" }} />
              Loading escalation logs…
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid var(--border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", background: "transparent" }}>
                  <thead style={{ background: "#f8fafc" }}>
                    <tr>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>SOS ID</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Resident</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Escalated To</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Level</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Reason</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Created Time</th>
                      <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
                          No escalation logs match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => (
                        <tr key={log.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "12px 14px", fontWeight: 700 }}>{log.sos ?? "—"}</td>
                          <td style={{ padding: "12px 14px" }}>{getResidentLabel(log)}</td>
                          <td style={{ padding: "12px 14px" }}>{log.recipient_user?.username || log.recipient_contact || "—"}</td>
                          <td style={{ padding: "12px 14px" }}>{log.escalation_level?.replace(/_/g, " ") || "—"}</td>
                          <td style={{ padding: "12px 14px" }}>{log.escalation_reason || "—"}</td>
                          <td style={{ padding: "12px 14px", color: "var(--muted)" }}>{formatDateTime(log.timestamp || log.created_at)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center" }}>
                            <button
                              onClick={() => openDeleteConfirm(log)}
                              title="Delete"
                              style={{ border: "none", background: "transparent", cursor: "pointer", color: "#dc2626" }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 6h18" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M10 11v6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M14 11v6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
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
                            maxWidth: 360,
                          }}
                        >
                          {toast.message}
                        </div>
                      ) : null}

                      <ConfirmDialog
                        isOpen={confirmOpen}
                        title={confirmTitle}
                        message={confirmMessage}
                        onConfirm={() => {
                          if (typeof confirmAction === "function") {
                            confirmAction();
                          }
                        }}
                        onCancel={() => setConfirmOpen(false)}
                      />

                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 12 }}>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>
                  Showing {filteredLogs.length} of {pagination.count} logs
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void loadLogs(page - 1)}
                    disabled={page <= 1}
                    style={{ border: "1px solid var(--border)", borderRadius: 999, background: "var(--surface-muted)", padding: "8px 12px", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.6 : 1 }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadLogs(page + 1)}
                    disabled={page >= totalPages}
                    style={{ border: "1px solid var(--border)", borderRadius: 999, background: "var(--surface-muted)", padding: "8px 12px", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.6 : 1 }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
