import { Link, useLocation } from "react-router-dom";

const menuItems = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "Society", path: "/societies" },
  { name: "Block / Towers", path: "/blocks" },
  { name: "Flats", path: "/flats" },
  { name: "Residents", path: "/residents" },
  { name: "Emergency Contacts", path: "/emergency-contacts" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside
      style={{
        width: "260px",
        minHeight: "100vh",
        background: "var(--sidebar-bg, linear-gradient(180deg, #0f172a 0%, #111827 100%))",
        color: "var(--sidebar-text, #f8fafc)",
        padding: "24px 18px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      <div>
        <div style={{ fontSize: "12px", letterSpacing: "0.24em", textTransform: "uppercase", color: "#93c5fd", marginBottom: "8px" }}>
          CareConnect
        </div>
        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>Admin Portal</h2>
      </div>

      <div style={{ background: "var(--sidebar-card, rgba(255,255,255,0.04))", borderRadius: "14px", padding: "12px", fontSize: "13px", color: "var(--sidebar-muted, #cbd5e1)" }}>
        Monitor communities, residents, and emergency contacts from one place.
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {menuItems.map((item) => {
          const active = location.pathname === item.path;
          return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  textDecoration: "none",
                  color: active ? "var(--sidebar-active-text, #eff6ff)" : "var(--sidebar-text, #cbd5e1)",
                  background: active ? "rgba(37, 99, 235, 0.12)" : "transparent",
                  fontWeight: active ? 700 : 500,
                  boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.06)" : "none",
                }}
              >
                {item.name}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}