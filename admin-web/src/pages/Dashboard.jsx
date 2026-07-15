import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AdminLayout from "../components/common/AdminLayout";

const moduleOptions = ["All", "SOS", "Residents", "Society", "Contacts", "Flats", "Blocks"];
const roleOptions = ["All", "Resident", "Security", "Admin"];

const activitySeed = [
  { id: 205, activity: "SOS Triggered", module: "SOS", performedBy: "Rahul", role: "Resident", timestamp: "2026-07-15T10:42:00", status: "Open" },
  { id: 204, activity: "SOS Resolved", module: "SOS", performedBy: "Admin", role: "Admin", timestamp: "2026-07-15T10:10:00", status: "Resolved" },
  { id: 203, activity: "Contact Added", module: "Contacts", performedBy: "Rahul", role: "Resident", timestamp: "2026-07-15T09:58:00", status: null },
  { id: 202, activity: "Society Updated", module: "Society", performedBy: "Admin", role: "Admin", timestamp: "2026-07-15T09:20:00", status: null },
  { id: 201, activity: "Resident Approved", module: "Residents", performedBy: "Admin", role: "Admin", timestamp: "2026-07-15T08:45:00", status: null },
  { id: 200, activity: "Flat Assigned", module: "Flats", performedBy: "Security", role: "Security", timestamp: "2026-07-15T08:12:00", status: null },
  { id: 199, activity: "Block Updated", module: "Blocks", performedBy: "Admin", role: "Admin", timestamp: "2026-07-15T07:05:00", status: null },
  { id: 198, activity: "SOS In Progress", module: "SOS", performedBy: "Security", role: "Security", timestamp: "2026-07-15T06:40:00", status: "In Progress" },
  { id: 197, activity: "Contact Verified", module: "Contacts", performedBy: "Rahul", role: "Resident", timestamp: "2026-07-15T06:18:00", status: null },
  { id: 196, activity: "Resident Registered", module: "Residents", performedBy: "Admin", role: "Admin", timestamp: "2026-07-15T06:00:00", status: null },
];

function formatDateTime(value) {
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return "—";
  }

  return {
    date: dateValue.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: dateValue.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function StatusBadge({ status }) {
  if (!status) {
    return null;
  }

  const tone = status === "Resolved" ? { background: "#dcfce7", color: "#166534" } : status === "In Progress" ? { background: "#fef3c7", color: "#92400e" } : { background: "#fee2e2", color: "#991b1b" };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: tone.background, color: tone.color }}>
      {status}
    </span>
  );
}

function SkeletonRows({ count = 10 }) {
  return Array.from({ length: count }).map((_, index) => (
    <tr key={`skeleton-${index}`} style={{ borderTop: "1px solid #f1f5f9" }}>
      <td colSpan="6" style={{ padding: "14px 16px" }}>
        <div style={{ height: "12px", borderRadius: "999px", background: "linear-gradient(90deg, #f8fafc 0%, #e2e8f0 50%, #f8fafc 100%)", animation: "pulse 1.2s ease-in-out infinite" }} />
      </td>
    </tr>
  ));
}

function Dashboard() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState("All");
  const [sortField, setSortField] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [page, setPage] = useState(1);

  const role = (localStorage.getItem("role") || "").toUpperCase();
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}") || {};
  const currentUserName = String(storedUser?.username || "").trim().toLowerCase();
  const isResident = role === "RESIDENT";

  useEffect(() => {
    const loadActivities = async () => {
      setLoading(true);
      setError("");

      try {
        await new Promise((resolve) => setTimeout(resolve, 650));
        setActivities(activitySeed);
      } catch (loadError) {
        console.error(loadError);
        setError("Unable to load recent activity right now.");
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    void loadActivities();
  }, []);

  const visibleActivities = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return activities
      .filter((activity) => {
        if (isResident) {
          const activityUser = String(activity.performedBy || "").trim().toLowerCase();
          if (activityUser !== currentUserName) {
            return false;
          }
        }

        const matchesModule = moduleFilter === "All" || activity.module === moduleFilter;
        const matchesRole = roleFilter === "All" || activity.role === roleFilter;
        const matchesSearch = !normalizedSearch || [activity.activity, activity.module, activity.performedBy, activity.role].some((value) => String(value).toLowerCase().includes(normalizedSearch));

        return matchesModule && matchesRole && matchesSearch;
      })
      .sort((left, right) => {
        const multiplier = sortDirection === "asc" ? 1 : -1;

        if (sortField === "timestamp") {
          return (new Date(left.timestamp) - new Date(right.timestamp)) * multiplier;
        }

        if (sortField === "activity") {
          return String(left.activity).localeCompare(String(right.activity)) * multiplier;
        }

        if (sortField === "module") {
          return String(left.module).localeCompare(String(right.module)) * multiplier;
        }

        return (left.id - right.id) * multiplier;
      });
  }, [activities, currentUserName, isResident, moduleFilter, roleFilter, search, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(visibleActivities.length / 10));
  const pagedActivities = useMemo(() => {
    const startIndex = (page - 1) * 10;
    return visibleActivities.slice(startIndex, startIndex + 10);
  }, [page, visibleActivities]);

  useEffect(() => {
    setPage(1);
  }, [search, moduleFilter, roleFilter, isResident]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("desc");
  };

  const handleReset = () => {
    setSearch("");
    setModuleFilter("All");
    setRoleFilter("All");
    setPage(1);
  };

  const handleLogout = async () => {
    const refresh = localStorage.getItem("refresh");
    const access = localStorage.getItem("access");

    try {
      if (refresh && access) {
        await axios.post(
          "http://127.0.0.1:8000/api/users/logout/",
          { refresh },
          {
            headers: {
              Authorization: `Bearer ${access}`,
            },
          }
        );
      }
    } catch (error) {
      console.log("Logout request failed:", error.response?.data || error.message);
    } finally {
      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
      localStorage.removeItem("user");
      localStorage.removeItem("role");
      navigate("/", { replace: true });
    }
  };

  const stats = [
    { title: "Societies", value: "12", subtitle: "Active communities", tone: "primary" },
    { title: "Residents", value: "184", subtitle: "Approved accounts", tone: "success" },
    { title: "Pending", value: "8", subtitle: "Awaiting review", tone: "warning" },
    { title: "Alerts", value: "24", subtitle: "Today’s activity", tone: "danger" },
  ];

  return (
    <AdminLayout>
      <div style={{ display: "grid", gap: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800, color: "var(--text, #0f172a)" }}>CareConnect Dashboard</h1>
            <p style={{ margin: "6px 0 0", color: "var(--muted, #64748b)" }}>Monitor operations, approvals, and resident activity from one streamlined workspace.</p>
          </div>
          <button onClick={handleLogout} style={{ border: "none", background: "#fff1f2", color: "#be123c", padding: "10px 14px", borderRadius: "999px", fontWeight: 700, cursor: "pointer" }}>
            Logout
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          {stats.map((stat) => (
            <div key={stat.title} style={{ background: "var(--surface, #fff)", borderRadius: "18px", border: "1px solid rgba(226,232,240,0.8)", padding: "18px", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{stat.title}</div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text, #0f172a)", margin: "8px 0 4px" }}>{stat.value}</div>
              <div style={{ color: stat.tone === "danger" ? "var(--danger, #dc2626)" : stat.tone === "warning" ? "#d97706" : stat.tone === "success" ? "#16a34a" : "var(--primary, #2563eb)", fontWeight: 600 }}>{stat.subtitle}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: "18px", border: "1px solid #e2e8f0", padding: "20px", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, color: "#0f172a" }}>Latest Activity</h3>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>Recent activities performed across the CareConnect platform.</p>
            </div>
            <button onClick={handleReset} style={{ border: "1px solid #dbeafe", background: "#f8fbff", color: "#2563eb", borderRadius: "999px", padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>
              View All
            </button>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "999px", padding: "8px 12px", minWidth: "260px" }}>
              <span style={{ fontSize: "14px" }}>🔍</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity" style={{ border: "none", outline: "none", width: "100%", background: "transparent" }} />
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Module</label>
              <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 10px", minWidth: "120px" }}>
                {moduleOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Role</label>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 10px", minWidth: "120px" }}>
                {roleOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: "14px", padding: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span>{error}</span>
              <button onClick={() => window.location.reload()} style={{ border: "none", background: "#dc2626", color: "white", borderRadius: "999px", padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>
                Retry
              </button>
            </div>
          ) : null}

          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "14px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "720px" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#f8fafc" }}>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b", cursor: "pointer" }} onClick={() => handleSort("id")}>ID</th>
                  <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b", cursor: "pointer" }} onClick={() => handleSort("activity")}>Activity</th>
                  <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b", cursor: "pointer" }} onClick={() => handleSort("module")}>Module</th>
                  <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b" }}>Performed By</th>
                  <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b" }}>Role</th>
                  <th style={{ padding: "12px 14px", fontSize: "12px", textTransform: "uppercase", color: "#64748b", cursor: "pointer" }} onClick={() => handleSort("timestamp")}>Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows count={10} />
                ) : pagedActivities.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: "28px 16px", textAlign: "center", color: "#64748b" }}>No recent activity found.</td>
                  </tr>
                ) : (
                  pagedActivities.map((activity) => {
                    const formatted = formatDateTime(activity.timestamp);
                    return (
                      <tr key={activity.id} style={{ borderTop: "1px solid #f1f5f9", background: "#fff", transition: "background 0.2s ease" }} onMouseEnter={(event) => { event.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(event) => { event.currentTarget.style.background = "#fff"; }}>
                        <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0f172a" }}>{activity.id}</td>
                        <td style={{ padding: "12px 14px", color: "#334155" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>{activity.activity}</span>
                            {activity.status ? <StatusBadge status={activity.status} /> : null}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", color: "#334155" }}>{activity.module}</td>
                        <td style={{ padding: "12px 14px", color: "#334155" }}>{activity.performedBy}</td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ display: "inline-flex", padding: "4px 8px", borderRadius: "999px", background: activity.role === "Admin" ? "#dbeafe" : activity.role === "Security" ? "#ede9fe" : "#dcfce7", color: activity.role === "Admin" ? "#1d4ed8" : activity.role === "Security" ? "#6d28d9" : "#166534", fontSize: "11px", fontWeight: 700 }}>
                            {activity.role}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 600 }}>{formatted.date}</div>
                          <div style={{ fontSize: "12px", marginTop: "2px" }}>{formatted.time}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && visibleActivities.length > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginTop: "14px" }}>
              <div style={{ color: "#64748b", fontSize: "13px" }}>
                Showing {Math.min(10, pagedActivities.length)} of {visibleActivities.length} activities
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} style={{ border: "1px solid #dbeafe", background: page === 1 ? "#f8fafc" : "#fff", color: page === 1 ? "#94a3b8" : "#2563eb", borderRadius: "999px", padding: "8px 12px", fontWeight: 700, cursor: page === 1 ? "not-allowed" : "pointer" }}>
                  Previous
                </button>
                <div style={{ color: "#334155", fontWeight: 700 }}>{page} / {totalPages}</div>
                <button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} style={{ border: "1px solid #dbeafe", background: page === totalPages ? "#f8fafc" : "#fff", color: page === totalPages ? "#94a3b8" : "#2563eb", borderRadius: "999px", padding: "8px 12px", fontWeight: 700, cursor: page === totalPages ? "not-allowed" : "pointer" }}>
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AdminLayout>
  );
}

export default Dashboard;