import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Header({ theme, toggleTheme }) {
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

  return (
    <header
      style={{
        height: "76px",
        background: "var(--surface, rgba(255,255,255,0.9))",
        backdropFilter: "blur(12px)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 28px",
        borderBottom: "1px solid rgba(226,232,240,0.8)",
        boxSizing: "border-box",
        color: "var(--text, #0f172a)",
      }}
    >
      <div>
        <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.24em", color: "var(--muted, #64748b)" }}>Operations overview</div>
        <h2 style={{ margin: "2px 0 0", fontSize: "20px", fontWeight: 800, color: "var(--text, #0f172a)" }}>Good morning, Admin</h2>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ padding: "8px 12px", borderRadius: "999px", background: "rgba(var(--primary-rgb),0.08)", color: "var(--primary)", fontWeight: 700, fontSize: "13px" }}>
          Live monitoring
        </div>

        <button onClick={toggleTheme} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 8, fontSize: 14 }} aria-label="Toggle theme">
          {theme === "dark" ? "☀️" : "🌙"}
        </button>

        <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, var(--primary) 0%, #1d4ed8 100%)", color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontWeight: "bold" }}>
          A
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text, #0f172a)" }}>Admin User</div>
          <div style={{ fontSize: "12px", color: "var(--muted, #64748b)" }}>Super Admin</div>
        </div>

        <button onClick={handleLogout} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 8, color: "var(--text, #0f172a)", fontWeight: 700 }}>
          Logout
        </button>
      </div>
    </header>
  );
}