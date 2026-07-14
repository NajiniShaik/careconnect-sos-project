import axios from "axios";
import { useNavigate } from "react-router-dom";

import AdminLayout from "../components/common/AdminLayout";

function Dashboard() {
  const navigate = useNavigate();

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
          <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Latest activity</h3>
          <p style={{ margin: 0, color: "#64748b" }}>Your management tools are ready for the next resident approval, emergency contact update, or society change.</p>
        </div>
      </div>
    </AdminLayout>
  );
}

export default Dashboard;