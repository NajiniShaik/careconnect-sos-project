import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AdminLayout from "../components/common/AdminLayout";
import DataTable from "../components/common/DataTable";
import FilterBar from "../components/common/FilterBar";
import PageTitle from "../components/common/PageTitle";
import {
  getAlertDashboardOverview,
  getAlertDashboardRecentActivity,
  getNotificationDeliveryStatus,
  getResponseMonitoringList,
} from "../api/dashboardApi";

const activitySortOptions = [
  { value: "trigger_time", label: "Trigger Time" },
  { value: "resident", label: "Resident" },
  { value: "society", label: "Society" },
  { value: "incident_type", label: "Incident Type" },
  { value: "stage", label: "Current Stage" },
  { value: "status", label: "Status" },
];

function formatTimestamp(value) {
  if (!value) {
    return "—";
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return value;
  }

  return dateValue.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return "—";
  }

  const safeSeconds = Math.max(0, Number(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function StatCard({ title, value, subtitle, tone = "primary" }) {
  const toneMap = {
    primary: { color: "#2563eb" },
    success: { color: "#16a34a" },
    warning: { color: "#d97706" },
    danger: { color: "#dc2626" },
    purple: { color: "#7c3aed" },
  };

  return (
    <div style={{ background: "#fff", borderRadius: "18px", border: "1px solid #e2e8f0", padding: "18px", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</div>
      <div style={{ fontSize: "28px", fontWeight: 800, color: toneMap[tone]?.color || "#0f172a", margin: "8px 0 4px" }}>{value}</div>
      <div style={{ color: "#64748b", fontSize: "13px" }}>{subtitle}</div>
    </div>
  );
}

function ChartCard({ title, data }) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div style={{ background: "#fff", borderRadius: "18px", border: "1px solid #e2e8f0", padding: "18px", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
      <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", marginBottom: "14px" }}>{title}</div>
      <div style={{ display: "grid", gap: "10px" }}>
        {data.map((item) => (
          <div key={item.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#64748b", marginBottom: "6px" }}>
              <span>{item.label}</span>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>{item.value}</span>
            </div>
            <div style={{ height: "10px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
              <div style={{ width: `${(item.value / maxValue) * 100}%`, height: "100%", borderRadius: "999px", background: item.color || "#2563eb" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState({});
  const [monitoringData, setMonitoringData] = useState([]);
  const [deliverySummary, setDeliverySummary] = useState({});
  const [activityRows, setActivityRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("trigger_time");
  const [sortDirection] = useState("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError("");

      try {
        const [overviewResponse, activityResponse, monitoringResponse, deliveryResponse] = await Promise.all([
          getAlertDashboardOverview(),
          getAlertDashboardRecentActivity({ page: 1, page_size: 100 }),
          getResponseMonitoringList({ page: 1, page_size: 100 }),
          getNotificationDeliveryStatus({ page: 1, page_size: 100 }),
        ]);

        const overviewData = overviewResponse?.data?.overview || {};
        const activityData = Array.isArray(activityResponse?.data?.results) ? activityResponse.data.results : [];
        const monitoringList = Array.isArray(monitoringResponse?.data?.results) ? monitoringResponse.data.results : [];
        const deliveryData = Array.isArray(deliveryResponse?.data?.results) ? deliveryResponse.data.results : [];

        setOverview(overviewData);
        setMonitoringData(monitoringList);
        setDeliverySummary({
          sent: deliveryData.filter((item) => String(item.status || "").toLowerCase() === "sent").length,
          delivered: deliveryData.filter((item) => String(item.status || "").toLowerCase() === "delivered").length,
          failed: deliveryData.filter((item) => String(item.status || "").toLowerCase() === "failed").length,
          retryCount: deliveryData.reduce((total, item) => total + Number(item.retry_count || 0), 0),
        });
        setActivityRows(
          activityData.map((item, index) => ({
            id: item.id || index + 1,
            resident: item.resident?.username || item.resident?.id || "Unknown",
            society: item.society || "—",
            incident_type: item.category || item.incident_type || "—",
            current_stage: item.current_stage || item.current_state?.current_stage || item.current_state?.current_status || "Active",
            trigger_time: item.created_at || item.trigger_time || null,
            status: item.current_state?.active === false ? "Resolved" : "Active",
          }))
        );
      } catch (loadError) {
        console.error(loadError);
        setError("Unable to load the alert monitoring dashboard right now.");
        setOverview({});
        setMonitoringData([]);
        setDeliverySummary({});
        setActivityRows([]);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, []);

  const incidentStageSummary = useMemo(() => {
    const stageCounts = {
      Active: 0,
      "Waiting for Guardian": 0,
      "Waiting for Volunteer": 0,
      "Waiting for Security": 0,
      Escalated: 0,
      Resolved: 0,
    };

    monitoringData.forEach((incident) => {
      const stage = String(incident.current_stage || incident.current_state?.current_stage || "Active");
      if (stage === "Closed" || stage === "Resolved") {
        stageCounts.Resolved += 1;
      } else if (stage === "Waiting for Guardian") {
        stageCounts["Waiting for Guardian"] += 1;
      } else if (stage === "Waiting for Volunteer") {
        stageCounts["Waiting for Volunteer"] += 1;
      } else if (stage === "Waiting for Security") {
        stageCounts["Waiting for Security"] += 1;
      } else if (stage === "Escalated") {
        stageCounts.Escalated += 1;
      } else {
        stageCounts.Active += 1;
      }
    });

    return stageCounts;
  }, [monitoringData]);

  const responseSummary = useMemo(() => {
    const guardianTimes = monitoringData.map((item) => Number(item.response_durations?.guardian_response_time_seconds || 0));
    const volunteerTimes = monitoringData.map((item) => Number(item.response_durations?.volunteer_response_time_seconds || 0));
    const securityTimes = monitoringData.map((item) => Number(item.response_durations?.security_response_time_seconds || 0));
    const resolutionTimes = monitoringData.map((item) => Number(item.response_durations?.total_resolution_time_seconds || 0));

    const longestActive = monitoringData
      .filter((item) => item.response_durations?.current_active_duration_seconds !== undefined)
      .sort((left, right) => Number(right.response_durations?.current_active_duration_seconds || 0) - Number(left.response_durations?.current_active_duration_seconds || 0))[0];

    return {
      guardianAverage: guardianTimes.length ? Math.round(guardianTimes.reduce((sum, value) => sum + value, 0) / guardianTimes.length) : 0,
      volunteerAverage: volunteerTimes.length ? Math.round(volunteerTimes.reduce((sum, value) => sum + value, 0) / volunteerTimes.length) : 0,
      securityAverage: securityTimes.length ? Math.round(securityTimes.reduce((sum, value) => sum + value, 0) / securityTimes.length) : 0,
      resolutionAverage: resolutionTimes.length ? Math.round(resolutionTimes.reduce((sum, value) => sum + value, 0) / resolutionTimes.length) : 0,
      longestActive: longestActive ? { resident: longestActive.resident?.username || "Unknown", duration: longestActive.response_durations?.current_active_duration_seconds } : null,
    };
  }, [monitoringData]);

  const chartData = useMemo(() => {
    const societyCounts = monitoringData.reduce((acc, incident) => {
      const society = incident.society || "Unknown";
      acc[society] = (acc[society] || 0) + 1;
      return acc;
    }, {});

    const categoryCounts = monitoringData.reduce((acc, incident) => {
      const category = incident.category || "Other";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    const hourCounts = monitoringData.reduce((acc, incident) => {
      const hour = incident.created_at ? new Date(incident.created_at).getHours() : "Unknown";
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});

    const dayCounts = monitoringData.reduce((acc, incident) => {
      const day = incident.created_at ? new Date(incident.created_at).toLocaleDateString("en-US", { weekday: "short" }) : "Unknown";
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {});

    return {
      society: Object.entries(societyCounts).map(([label, value]) => ({ label, value, color: "#2563eb" })),
      category: Object.entries(categoryCounts).map(([label, value]) => ({ label, value, color: "#7c3aed" })),
      hour: Object.entries(hourCounts).map(([label, value]) => ({ label: `${label}:00`, value, color: "#16a34a" })),
      day: Object.entries(dayCounts).map(([label, value]) => ({ label, value, color: "#d97706" })),
    };
  }, [monitoringData]);

  const filteredActivities = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return activityRows
      .filter((activity) => {
        if (!normalizedSearch) {
          return true;
        }

        return [activity.resident, activity.society, activity.incident_type, activity.current_stage, activity.status]
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      })
      .sort((left, right) => {
        const multiplier = sortDirection === "asc" ? 1 : -1;
        const leftValue = left[sortField] || "";
        const rightValue = right[sortField] || "";

        if (sortField === "trigger_time") {
          return (new Date(leftValue) - new Date(rightValue)) * multiplier;
        }

        return String(leftValue).localeCompare(String(rightValue)) * multiplier;
      });
  }, [activityRows, search, sortDirection, sortField]);

  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / 10));
  const pagedActivities = useMemo(() => {
    const startIndex = (page - 1) * 10;
    return filteredActivities.slice(startIndex, startIndex + 10);
  }, [filteredActivities, page]);

  useEffect(() => {
    setPage(1);
  }, [search, sortField, sortDirection]);

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

  return (
    <AdminLayout>
      <div style={{ display: "grid", gap: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <PageTitle title="Alert Monitoring Dashboard" />
            <p style={{ margin: "-6px 0 0", color: "var(--muted, #64748b)" }}>Monitor live incidents, deliverability, response timings, and recent activity from one admin view.</p>
          </div>
          <button onClick={handleLogout} style={{ border: "none", background: "#fff1f2", color: "#be123c", padding: "10px 14px", borderRadius: "999px", fontWeight: 700, cursor: "pointer" }}>
            Logout
          </button>
        </div>

        {error ? (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1b", borderRadius: "14px", padding: "14px" }}>{error}</div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <StatCard title="Active Incidents" value={overview.active_incidents ?? incidentStageSummary.Active} subtitle="Currently open" tone="danger" />
          <StatCard title="Waiting for Guardian" value={incidentStageSummary["Waiting for Guardian"]} subtitle="Pending response" tone="warning" />
          <StatCard title="Waiting for Volunteer" value={incidentStageSummary["Waiting for Volunteer"]} subtitle="Volunteer follow-up" tone="warning" />
          <StatCard title="Waiting for Security" value={incidentStageSummary["Waiting for Security"]} subtitle="Security escalation" tone="warning" />
          <StatCard title="Escalated" value={incidentStageSummary.Escalated} subtitle="Auto-escalated" tone="purple" />
          <StatCard title="Resolved Today" value={overview.resolved_incidents ?? incidentStageSummary.Resolved} subtitle="Resolved incidents" tone="success" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <StatCard title="Sent" value={deliverySummary.sent ?? 0} subtitle="Notifications sent" tone="primary" />
          <StatCard title="Delivered" value={deliverySummary.delivered ?? 0} subtitle="Successful deliveries" tone="success" />
          <StatCard title="Failed" value={deliverySummary.failed ?? 0} subtitle="Delivery failures" tone="danger" />
          <StatCard title="Retry Count" value={deliverySummary.retryCount ?? 0} subtitle="Retry attempts" tone="purple" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <StatCard title="Avg Guardian Response" value={formatDuration(responseSummary.guardianAverage)} subtitle="Average guardian response" tone="primary" />
          <StatCard title="Avg Volunteer Response" value={formatDuration(responseSummary.volunteerAverage)} subtitle="Average volunteer response" tone="warning" />
          <StatCard title="Avg Security Response" value={formatDuration(responseSummary.securityAverage)} subtitle="Average security response" tone="warning" />
          <StatCard title="Avg Resolution" value={formatDuration(responseSummary.resolutionAverage)} subtitle="Average resolution time" tone="success" />
        </div>

        <div style={{ background: "#fff", borderRadius: "18px", border: "1px solid #e2e8f0", padding: "18px", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>Longest Active Incident</div>
          <div style={{ color: "#64748b" }}>
            {responseSummary.longestActive ? `${responseSummary.longestActive.resident} • ${formatDuration(responseSummary.longestActive.duration)}` : "No active incidents available yet."}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          <ChartCard title="Incidents per Society" data={chartData.society} />
          <ChartCard title="Incidents by Category" data={chartData.category} />
          <ChartCard title="Incidents by Hour" data={chartData.hour} />
          <ChartCard title="Incidents by Day" data={chartData.day} />
        </div>

        <div style={{ background: "#fff", borderRadius: "18px", border: "1px solid #e2e8f0", padding: "20px", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, color: "#0f172a" }}>Recent Activity</h3>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>Recent incident activity from the backend monitoring endpoints.</p>
            </div>
          </div>

          <FilterBar
            search={search}
            setSearch={setSearch}
            filter={sortField}
            setFilter={setSortField}
            filterOptions={activitySortOptions}
            placeholder="Search incidents"
          />

          {loading ? (
            <div style={{ padding: "28px", textAlign: "center", color: "#64748b" }}>Loading dashboard metrics...</div>
          ) : (
            <>
              <DataTable
                columns={["Resident", "Society", "Incident Type", "Current Stage", "Trigger Time", "Status"]}
                data={pagedActivities}
                renderCell={(item, column) => {
                  const columnKey = column.toLowerCase().replace(/ /g, "_");
                  if (columnKey === "trigger_time") {
                    return formatTimestamp(item.trigger_time);
                  }

                  if (columnKey === "current_stage") {
                    return item.current_stage || "—";
                  }

                  if (columnKey === "status") {
                    return (
                      <span style={{ display: "inline-flex", padding: "4px 8px", borderRadius: "999px", background: item.status === "Resolved" ? "#dcfce7" : "#fee2e2", color: item.status === "Resolved" ? "#166534" : "#991b1b", fontSize: "12px", fontWeight: 700 }}>
                        {item.status}
                      </span>
                    );
                  }

                  return item[columnKey] || "—";
                }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginTop: "14px" }}>
                <div style={{ color: "#64748b", fontSize: "13px" }}>
                  Showing {Math.min(page * 10, filteredActivities.length)} of {filteredActivities.length} incidents
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
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default Dashboard;