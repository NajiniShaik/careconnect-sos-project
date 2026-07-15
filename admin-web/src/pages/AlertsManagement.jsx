import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../components/common/AdminLayout";
import { deleteSosAlert, getSosAlerts, resolveSosAlert } from "../api/sosApi";

const categoryOptions = ["All", "Medical", "Fire", "Security", "Power", "Other"];
const statusOptions = ["All", "Open", "In Progress", "Resolved"];

const normalizeStatus = (value = "") => String(value || "").toUpperCase();
const normalizeCategory = (value = "") => String(value || "").trim().toLowerCase();

function formatTime(value) {
  if (!value) {
    return "—";
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return value;
  }

  return dateValue.toLocaleString();
}

function getStatusTone(status) {
  const normalized = normalizeStatus(status);

  if (normalized === "RESOLVED") {
    return { background: "#dcfce7", color: "#166534" };
  }

  if (normalized === "IN_PROGRESS") {
    return { background: "#fef3c7", color: "#92400e" };
  }

  return { background: "#fee2e2", color: "#991b1b" };
}

function Spinner() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
      <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "2px solid #bfdbfe", borderTopColor: "#2563eb", animation: "spin 0.8s linear infinite" }} />
      <span style={{ color: "#64748b" }}>Loading...</span>
    </div>
  );
}

export default function AlertsManagement() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const role = (localStorage.getItem("role") || "").toUpperCase();
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}") || {};
  const residentUserId = String(storedUser?.id || "").trim();
  const residentUsername = String(storedUser?.username || "").trim().toLowerCase();
  const isResident = role === "RESIDENT";
  const canResolve = role === "ADMIN";
  const canDelete = role === "ADMIN" || isResident;

  const loadAlerts = async (isRefresh = false) => {
    setPage(1);

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await getSosAlerts();
      setAlerts(Array.isArray(response?.data) ? response.data : []);
      setError("");
    } catch (err) {
      console.error("Failed to load alerts", err);
      setError("Unable to load SOS alerts right now.");
      setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, []);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const category = normalizeCategory(alert?.category || "");
      const status = normalizeStatus(alert?.status || "");
      const residentName = String(alert?.user?.username || alert?.user?.name || alert?.user || "").toLowerCase();
      const message = String(alert?.message || "").toLowerCase();
      const categoryLabel = String(alert?.category || "").toLowerCase();
      const location = String(alert?.location || "").toLowerCase();
      const searchText = search.toLowerCase();
      const ownerId = String(alert?.user?.id || "").trim();
      const ownerUsername = String(alert?.user?.username || "").trim().toLowerCase();
      const matchesOwnership = !isResident || ownerId === residentUserId || ownerUsername === residentUsername;

      const categoryMatch = categoryFilter === "All" || category === normalizeCategory(categoryFilter);
      const statusMatch = statusFilter === "All" || status === normalizeStatus(statusFilter);
      const searchMatch = !searchText || residentName.includes(searchText) || message.includes(searchText) || categoryLabel.includes(searchText) || location.includes(searchText);

      return matchesOwnership && categoryMatch && statusMatch && searchMatch;
    });
  }, [alerts, categoryFilter, residentUsername, residentUserId, search, statusFilter, isResident]);

  const summary = useMemo(() => {
    const total = alerts.length;
    const open = alerts.filter((alert) => normalizeStatus(alert?.status) === "OPEN").length;
    const inProgress = alerts.filter((alert) => normalizeStatus(alert?.status) === "IN_PROGRESS").length;
    const resolved = alerts.filter((alert) => normalizeStatus(alert?.status) === "RESOLVED").length;

    return { total, open, inProgress, resolved };
  }, [alerts]);

  const pagedAlerts = useMemo(() => {
    const startIndex = (page - 1) * 10;
    return filteredAlerts.slice(startIndex, startIndex + 10);
  }, [filteredAlerts, page]);

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / 10));

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, statusFilter, isResident, residentUsername, residentUserId]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleResolve = async (alert) => {
    if (!canResolve || !alert?.id) {
      return;
    }

    setPage(1);
    setActionLoadingId(alert.id);
    try {
      await resolveSosAlert(alert.id, "RESOLVED");
      await loadAlerts(true);
    } catch (err) {
      console.error("Failed to resolve alert", err);
      setError("Unable to resolve this alert.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (alert) => {
    if (!alert?.id) {
      return;
    }

    if (isResident) {
      const ownerId = String(alert?.user?.id || "").trim();
      const ownerUsername = String(alert?.user?.username || "").trim().toLowerCase();
      const isOwnedByResident = ownerId === residentUserId || ownerUsername === residentUsername;
      if (!isOwnedByResident) {
        return;
      }
    }

    if (!canDelete && !isResident) {
      return;
    }

    const confirmed = window.confirm("Delete this SOS alert?");
    if (!confirmed) {
      return;
    }

    setPage(1);
    setActionLoadingId(alert.id);
    try {
      await deleteSosAlert(alert.id);
      await loadAlerts(true);
    } catch (err) {
      console.error("Failed to delete alert", err);
      setError("Unable to delete this alert.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) {
      return;
    }

    setPage(nextPage);
  };

  return (
    <AdminLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800, color: "var(--text, #0f172a)" }}>SOS Alerts</h1>
            <div style={{ marginTop: "6px", color: "var(--muted, #64748b)" }}>Monitor resident SOS alerts by category, status, and urgency.</div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "999px", padding: "8px 12px" }}>
              <span style={{ fontSize: "14px" }}>🔍</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search alerts"
                style={{ border: "none", outline: "none", minWidth: "220px", fontSize: "14px" }}
              />
            </div>
            <button
              onClick={() => void loadAlerts(true)}
              style={{ border: "none", background: "#2563eb", color: "white", borderRadius: "999px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
          {[
            { label: "Total Alerts", value: summary.total, tone: "#2563eb" },
            { label: "Open", value: summary.open, tone: "#dc2626" },
            { label: "In Progress", value: summary.inProgress, tone: "#d97706" },
            { label: "Resolved", value: summary.resolved, tone: "#16a34a" },
          ].map((item) => (
            <div key={item.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "16px" }}>
              <div style={{ fontSize: "13px", color: "var(--muted, #64748b)", marginBottom: "6px" }}>{item.label}</div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: item.tone }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
            <div style={{ fontWeight: 700, color: "var(--text, #0f172a)" }}>Category</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {categoryOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setCategoryFilter(option)}
                  style={{
                    border: "1px solid #dbeafe",
                    background: categoryFilter === option ? "#eff6ff" : "white",
                    color: categoryFilter === option ? "#1d4ed8" : "#475569",
                    borderRadius: "999px",
                    padding: "7px 12px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontWeight: 700, color: "var(--text, #0f172a)" }} htmlFor="status-filter">Status</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 10px", minWidth: "150px" }}
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "14px", padding: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void loadAlerts(true)} style={{ border: "none", background: "#dc2626", color: "white", borderRadius: "999px", padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}>
              Retry
            </button>
          </div>
        ) : null}

        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "18px", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "32px", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "220px" }}>
              <Spinner />
            </div>
          ) : alerts.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--muted, #64748b)" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>No SOS alerts yet</div>
              <div>Alerts will appear here as soon as residents report them.</div>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--muted, #64748b)" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>No alerts match the current filters</div>
              <div>Try adjusting the category or status selection.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b" }}>Resident</th>
                    <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b" }}>Category</th>
                    <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b" }}>Message</th>
                    <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b" }}>Location</th>
                    <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b" }}>Status</th>
                    <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b" }}>Created</th>
                    <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAlerts.map((alert) => {
                    const statusTone = getStatusTone(alert?.status);
                    return (
                      <tr key={alert.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0f172a" }}>{alert?.user?.username || alert?.user?.name || "Unknown"}</td>
                        <td style={{ padding: "12px 14px", color: "#334155" }}>{String(alert?.category || "Other").replace(/^./, (char) => char.toUpperCase())}</td>
                        <td style={{ padding: "12px 14px", color: "#334155", maxWidth: "280px" }}>{alert?.message || "—"}</td>
                        <td style={{ padding: "12px 14px", color: "#334155" }}>{alert?.location || "—"}</td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, background: statusTone.background, color: statusTone.color }}>
                            {String(alert?.status || "OPEN").replace(/_/g, " ")}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", color: "#64748b", whiteSpace: "nowrap" }}>{formatTime(alert?.created_at)}</td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {canResolve ? (
                              <button
                                onClick={() => void handleResolve(alert)}
                                disabled={actionLoadingId === alert.id}
                                style={{ border: "none", background: "#2563eb", color: "white", borderRadius: "10px", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}
                              >
                                {actionLoadingId === alert.id ? "Working..." : "Resolve"}
                              </button>
                            ) : null}
                            {canDelete || isResident ? (
                              <button
                                onClick={() => void handleDelete(alert)}
                                disabled={actionLoadingId === alert.id}
                                style={{ border: "none", background: "#dc2626", color: "white", borderRadius: "10px", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}
                              >
                                {actionLoadingId === alert.id ? "Working..." : "Delete"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && !error && filteredAlerts.length > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "0 4px" }}>
            <div style={{ color: "#64748b", fontSize: "13px" }}>
              Showing {Math.min((page - 1) * 10 + 1, filteredAlerts.length)}–{Math.min(page * 10, filteredAlerts.length)} of {filteredAlerts.length} alerts
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                style={{ border: "1px solid #dbeafe", background: page === 1 ? "#f8fafc" : "#fff", color: page === 1 ? "#94a3b8" : "#2563eb", borderRadius: "999px", padding: "8px 12px", fontWeight: 700, cursor: page === 1 ? "not-allowed" : "pointer" }}
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  key={pageNumber}
                  onClick={() => handlePageChange(pageNumber)}
                  style={{ minWidth: "36px", border: "1px solid #dbeafe", background: pageNumber === page ? "#2563eb" : "#fff", color: pageNumber === page ? "#fff" : "#2563eb", borderRadius: "999px", padding: "8px 10px", fontWeight: 700, cursor: "pointer" }}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                style={{ border: "1px solid #dbeafe", background: page === totalPages ? "#f8fafc" : "#fff", color: page === totalPages ? "#94a3b8" : "#2563eb", borderRadius: "999px", padding: "8px 12px", fontWeight: 700, cursor: page === totalPages ? "not-allowed" : "pointer" }}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
