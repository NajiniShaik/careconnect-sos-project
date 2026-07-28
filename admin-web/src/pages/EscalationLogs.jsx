/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../components/common/AdminLayout";
import PageTitle from "../components/common/PageTitle";
import { getEscalationLogs } from "../api/escalationApi";

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
                <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
                  <thead style={{ background: "#f8fafc" }}>
                    <tr>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>SOS ID</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Resident</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Escalated To</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Level</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Reason</th>
                      <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Created Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
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
                        </tr>
                      ))
                    )}
                  </tbody>
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
                    style={{ border: "1px solid var(--border)", borderRadius: 999, background: "#fff", padding: "8px 12px", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.6 : 1 }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadLogs(page + 1)}
                    disabled={page >= totalPages}
                    style={{ border: "1px solid var(--border)", borderRadius: 999, background: "#fff", padding: "8px 12px", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.6 : 1 }}
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
