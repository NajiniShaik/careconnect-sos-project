import { Link, useLocation } from "react-router-dom";

const menuItems = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "Society", path: "/societies" },
  { name: "Block / Towers", path: "/blocks" },
  { name: "Flats", path: "/flats" },
  { name: "Residents", path: "/residents" },
  { name: "Emergency Contacts", path: "/emergency-contacts" },
  { name: "Alerts", path: "/alerts" },
  { name: "Reporting", path: "/reporting" },
  { name: "Notifications", path: "/notifications" },
  {
    name: "Settings",
    path: "/guardian-escalation",
    children: [
      { name: "Settings", path: "/guardian-escalation" },
      { name: "Logs", path: "/escalation-logs" },
    ],
  },
];

function SidebarIcon({ name }) {
  const lowerName = String(name || "").toLowerCase();
  const commonProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (lowerName.includes("dashboard") || lowerName.includes("home")) {
    return (
      <svg {...commonProps}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
    );
  }

  if (lowerName.includes("society") || lowerName.includes("community") || lowerName.includes("building")) {
    return (
      <svg {...commonProps}>
        <path d="M4 21V8.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 10 8.5V21" />
        <path d="M10 21V5.5A1.5 1.5 0 0 1 11.5 4h3A1.5 1.5 0 0 1 16 5.5V21" />
        <path d="M16 21V10.5A1.5 1.5 0 0 1 17.5 9h1A1.5 1.5 0 0 1 20 10.5V21" />
        <path d="M7 13h2" />
        <path d="M13 13h2" />
        <path d="M7 17h2" />
        <path d="M13 17h2" />
      </svg>
    );
  }

  if (lowerName.includes("flat") || lowerName.includes("apartment")) {
    return (
      <svg {...commonProps}>
        <path d="M4 21V8.5A1.5 1.5 0 0 1 5.5 7H9V3h6v4h3.5A1.5 1.5 0 0 1 20 8.5V21" />
        <path d="M9 21v-5h6v5" />
        <path d="M9 10h6" />
      </svg>
    );
  }

  if (lowerName.includes("resident") || lowerName.includes("user")) {
    return (
      <svg {...commonProps}>
        <path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" />
        <circle cx="8" cy="7" r="3" />
        <path d="M17 8a2 2 0 1 0 0 4" />
        <path d="M20 15a2 2 0 1 0 0 4" />
      </svg>
    );
  }

  if (lowerName.includes("emergency") || lowerName.includes("contact") || lowerName.includes("phone")) {
    return (
      <svg {...commonProps}>
        <path d="M7 4h4a2 2 0 0 1 2 2v2a2 2 0 0 1-1 1.73l-1.2 1.2a16 16 0 0 0 4.2 4.2l1.2-1.2A2 2 0 0 1 16 12h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 2-2h4" />
      </svg>
    );
  }

  if (lowerName.includes("alert") || lowerName.includes("warning") || lowerName.includes("triangle")) {
    return (
      <svg {...commonProps}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h14.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  if (lowerName.includes("notification") || lowerName.includes("bell")) {
    return (
      <svg {...commonProps}>
        <path d="M15 17H5a2 2 0 0 1-2-2 4 4 0 0 0 1.2-2.8L5 8V7a4 4 0 0 1 8 0v1l.8 4.2A4 4 0 0 0 15 15a2 2 0 0 1-2 2" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
    );
  }

  if (lowerName.includes("setting") || lowerName.includes("gear")) {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 3V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export default function Sidebar({ collapsed = false, mobileOpen = false, onClose }) {
  const location = useLocation();

  const sidebarWidth = collapsed ? 72 : 260;
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 900;

  return (
    <aside
      className="admin-sidebar"
      aria-hidden={mobileOpen ? "false" : "false"}
      style={{
        width: sidebarWidth,
        minHeight: "100vh",
        height: "100vh",
        background: "var(--sidebar-bg, linear-gradient(180deg, #0f172a 0%, #111827 100%))",
        color: "var(--sidebar-text, #f8fafc)",
        padding: collapsed ? "20px 8px" : "24px 18px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        transition: "width 200ms ease, padding 200ms ease, transform 200ms ease",
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 70,
        transform: isMobile && !mobileOpen ? "translateX(-110%)" : "none",
        boxShadow: isMobile && mobileOpen ? "0 20px 40px rgba(2,6,23,0.4)" : "none",
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div>
        <div style={{ fontSize: "12px", letterSpacing: "0.24em", textTransform: "uppercase", color: "#93c5fd", marginBottom: "8px" }}>
          {collapsed ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 28 }}>CC</div>
          ) : (
            "CareConnect"
          )}
        </div>
        <h2 style={{ margin: 0, fontSize: collapsed ? "16px" : "22px", fontWeight: 800 }}>{collapsed ? "" : "Admin Portal"}</h2>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
        {menuItems.map((item) => {
          const active = item.path === "/notifications"
            ? location.pathname.startsWith("/notifications")
            : location.pathname === item.path;
          const hasChildren = Array.isArray(item.children) && item.children.length > 0;

          const Icon = ({ name }) => (
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: active ? "rgba(255,255,255,0.06)" : "transparent",
                color: active ? "var(--sidebar-active-text, #eff6ff)" : "var(--sidebar-text, #cbd5e1)",
                flexShrink: 0,
              }}
            >
              <SidebarIcon name={name} />
            </div>
          );

          return (
            <div key={item.path} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Link
                to={item.path}
                title={collapsed ? item.name : undefined}
                aria-label={item.name}
                onClick={() => {
                  if (window.innerWidth <= 900 && typeof onClose === "function") onClose();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: collapsed ? "10px 6px" : "12px 14px",
                  borderRadius: "12px",
                  textDecoration: "none",
                  color: active ? "var(--sidebar-active-text, #eff6ff)" : "var(--sidebar-text, #cbd5e1)",
                  background: active ? "rgba(37, 99, 235, 0.12)" : "transparent",
                  fontWeight: active ? 700 : 500,
                  boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.06)" : "none",
                  justifyContent: collapsed ? "center" : "flex-start",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon name={item.name} />
                <span style={{ display: collapsed ? "none" : "inline-block", transition: "opacity 150ms ease" }}>{item.name}</span>
              </Link>

              {hasChildren && !collapsed ? null : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}