import { useEffect, useMemo, useState, useRef } from "react";

import AdminLayout from "../components/common/AdminLayout";
import PageTitle from "../components/common/PageTitle";
import DataTable from "../components/common/DataTable";
import Charts from "../components/common/Charts";
import { getReporting, downloadReportingExcel, downloadReportingPdf } from "../api/reportingApi";
import { getSocieties } from "../api/societyApi";

const REPORTING_CATEGORIES = [
  { value: "medical", label: "Medical" },
  { value: "fire", label: "Fire" },
  { value: "other", label: "Other" },
  { value: "security", label: "Security" },
  { value: "power", label: "Power" },
];

function formatSeconds(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return "—";
  }

  const value = Math.max(0, Number(seconds));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;

  if (minutes === 0) {
    return `${remainder}s`;
  }

  return `${minutes}m ${remainder}s`;
}

function StatCard({ label, value, description, tone = "primary" }) {
  const toneColor = {
    primary: "#2563eb",
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    purple: "#7c3aed",
  };

  return (
    <div className="glass-panel" style={{ borderRadius: 18, padding: 20, minHeight: 128 }}>
      <div style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: toneColor[tone] || toneColor.primary, marginBottom: 8 }}>
        {value}
      </div>
      <div style={{ color: "#475569", fontSize: 13 }}>
        {description}
      </div>
    </div>
  );
}

export default function ReportingDashboard() {
  const [report, setReport] = useState(null);
  const [societies, setSocieties] = useState([]);
  const [filters, setFilters] = useState({
    start_date: "",
    end_date: "",
    society: "",
    category: "",
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const requestIdRef = useRef(0);

  useEffect(() => {
    const loadPage = async () => {
      setLoading(true);
      setError("");
      const requestId = ++requestIdRef.current;

      try {
        const [societyResponse, reportResponse] = await Promise.all([
          getSocieties(),
          getReporting({}),
        ]);

        const societyOptions = Array.isArray(societyResponse?.data?.results)
          ? societyResponse.data.results
          : Array.isArray(societyResponse?.data)
          ? societyResponse.data
          : [];

        if (requestId === requestIdRef.current) {
          setSocieties(societyOptions);
          setReport(reportResponse.data);
        }
      } catch (err) {
        console.error(err);
        setError("Unable to load reporting data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    void loadPage();
  }, []);

  const handleChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleApply = async () => {
    setLoading(true);
    setError("");

    const requestId = ++requestIdRef.current;

    try {
      const reportResponse = await getReporting(filters);
      if (requestId === requestIdRef.current) {
        setReport(reportResponse.data);
      }
    } catch (err) {
      console.error(err);
      setError("Unable to load reporting data. Please try again.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setFilters({ start_date: "", end_date: "", society: "", category: "" });
    setLoading(true);
    setError("");

    const requestId = ++requestIdRef.current;

    try {
      const reportResponse = await getReporting({});
      if (requestId === requestIdRef.current) {
        setReport(reportResponse.data);
      }
    } catch (err) {
      console.error(err);
      setError("Unable to reset reporting filters.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type) => {
    setExporting(true);
    setError("");

    try {
      const blob = type === "excel"
        ? await downloadReportingExcel(filters)
        : await downloadReportingPdf(filters);
      const filename = `sos_reporting.${type === "excel" ? "xls" : "pdf"}`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Unable to download the report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const societyRows = useMemo(() => {
    if (!report?.society_counts) {
      return [];
    }

    return Object.entries(report.society_counts).map(([society, counts]) => ({
      society,
      total: counts.total,
      active: counts.active,
      escalated: counts.escalated,
      resolved: counts.resolved,
    }));
  }, [report]);

  const categoryRows = useMemo(() => {
    if (!report?.category_counts) {
      return [];
    }

    return Object.entries(report.category_counts).map(([category, count]) => ({
      category: category || "(blank)",
      count,
    }));
  }, [report]);

  const societyChartData = useMemo(() => {
    return societyRows.map((row, index) => ({
      label: row.society,
      value: row.total,
      color: ["#2563eb", "#7c3aed", "#16a34a", "#d97706", "#dc2626"][index % 5],
    }));
  }, [societyRows]);

  const categoryChartData = useMemo(() => {
    return categoryRows.map((row, index) => ({
      label: row.category,
      value: row.count,
      color: ["#7c3aed", "#2563eb", "#16a34a", "#d97706", "#0891b2"][index % 5],
    }));
  }, [categoryRows]);

  const response = report?.response_time_summary || {};
  const isEmpty = !loading && report && report.total_incidents === 0;

  return (
    <AdminLayout>
      <div style={{ display: "grid", gap: 24 }}>
        <div>
          <PageTitle title="Admin Reporting Dashboard" subtitle="View incident metrics, category and society summaries, and export reporting data." />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <StatCard label="Total incidents" value={report?.total_incidents ?? "—"} description="Total SOS incidents returned by the selected filters." tone="primary" />
          <StatCard label="Active incidents" value={report?.active_incidents ?? "—"} description="Incidents that are still open or in progress." tone="danger" />
          <StatCard label="Escalated incidents" value={report?.escalated_incidents ?? "—"} description="Incidents marked escalated or automatically escalated." tone="purple" />
          <StatCard label="Resolved incidents" value={report?.resolved_incidents ?? "—"} description="Incidents that have been closed or resolved." tone="success" />
        </div>

        <div style={{ display: "grid", gap: 16, padding: 20, borderRadius: 18, background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <div style={{ minWidth: 180, display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Start date</label>
              <input
                type="date"
                name="start_date"
                value={filters.start_date}
                onChange={(event) => handleChange("start_date", event.target.value)}
                onInput={(event) => handleChange("start_date", event.target.value)}
                style={{ padding: "11px 14px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a" }}
              />
            </div>

            <div style={{ minWidth: 180, display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>End date</label>
              <input
                type="date"
                name="end_date"
                value={filters.end_date}
                onChange={(event) => handleChange("end_date", event.target.value)}
                onInput={(event) => handleChange("end_date", event.target.value)}
                style={{ padding: "11px 14px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a" }}
              />
            </div>

            <div style={{ minWidth: 180, display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Society</label>
              <select
                name="society"
                value={filters.society}
                onChange={(event) => handleChange("society", event.target.value)}
                onInput={(event) => handleChange("society", event.target.value)}
                style={{ padding: "11px 14px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a" }}
              >
                <option value="">All societies</option>
                {societies
                  .filter((society) => society && (society.id !== undefined && society.id !== null))
                  .map((society) => (
                    <option key={String(society.id)} value={String(society.id)}>
                      {society.name || "Unnamed Society"}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ minWidth: 180, display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Category</label>
              <select
                name="category"
                value={filters.category}
                onChange={(event) => handleChange("category", event.target.value)}
                onInput={(event) => handleChange("category", event.target.value)}
                style={{ padding: "11px 14px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a" }}
              >
                <option value="">All categories</option>
                {REPORTING_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button
                onClick={handleApply}
                disabled={loading}
                style={{ padding: "12px 18px", borderRadius: 12, border: "none", backgroundColor: "#2563eb", color: "#ffffff", cursor: "pointer", fontWeight: 700 }}
              >
                Apply filters
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                style={{ padding: "12px 18px", borderRadius: 12, border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
              >
                Reset filters
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Export</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleExport("excel")}
                  disabled={loading || exporting}
                  style={{ padding: "10px 16px", borderRadius: 12, border: "none", backgroundColor: "#10b981", color: "#ffffff", cursor: "pointer", fontWeight: 700 }}
                >
                  Download Excel
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("pdf")}
                  disabled={loading || exporting}
                  style={{ padding: "10px 16px", borderRadius: 12, border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
                >
                  Download PDF
                </button>
              </div>
            </div>
            <div style={{ color: "#475569", fontSize: 13, alignSelf: "center" }}>
              {loading ? "Loading reporting metrics..." : exporting ? "Preparing export file..." : "Report uses backend reporting APIs and live filters."}
            </div>
          </div>
        </div>

        {error ? (
          <div style={{ borderRadius: 18, padding: 18, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
            {error}
          </div>
        ) : null}

        {isEmpty ? (
          <div style={{ borderRadius: 18, padding: 24, background: "#f8fafc", border: "1px dashed #cbd5e1", color: "#475569" }}>
            No matching incidents were found for the selected filters.
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
          <StatCard label="Guardian response avg" value={formatSeconds(response.guardian_response_seconds_avg)} description={`Count: ${response.counts?.with_guardian_response ?? 0}`} tone="primary" />
          <StatCard label="Volunteer response avg" value={formatSeconds(response.volunteer_response_seconds_avg)} description={`Count: ${response.counts?.with_volunteer_response ?? 0}`} tone="warning" />
          <StatCard label="Security response avg" value={formatSeconds(response.security_response_seconds_avg)} description={`Count: ${response.counts?.with_security_response ?? 0}`} tone="warning" />
          <StatCard label="Total resolution avg" value={formatSeconds(response.total_resolution_seconds_avg)} description={`Count: ${response.counts?.with_total_resolution ?? 0}`} tone="success" />
        </div>

        <div style={{ display: "grid", gap: 20 }}>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
            <Charts.SocietyChart title="Incidents by Society" data={societyChartData} />
            <Charts.CategoryDonut title="Incidents by Category" data={categoryChartData} />
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Society-wise report</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{societyRows.length} societies</div>
              </div>
              <DataTable
                columns={["Society", "Total", "Active", "Escalated", "Resolved"]}
                data={societyRows}
                renderCell={(item, column) => {
                  switch (column) {
                    case "Society":
                      return item.society;
                    case "Total":
                      return item.total;
                    case "Active":
                      return item.active;
                    case "Escalated":
                      return item.escalated;
                    case "Resolved":
                      return item.resolved;
                    default:
                      return "—";
                  }
                }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Category-wise report</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{categoryRows.length} categories</div>
              </div>
              <DataTable
                columns={["Category", "Count"]}
                data={categoryRows}
                renderCell={(item, column) => (column === "Category" ? item.category : item.count)}
              />
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
