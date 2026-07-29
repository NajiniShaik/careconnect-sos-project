import Sidebar from "./Sidebar";
import Header from "./Header";
import { useEffect, useState } from "react";

// Sidebar sizing constants (kept inline where used)

export default function AdminLayout({ children }) {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  // sidebar collapsed state persisted in localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebarCollapsed") === "true";
    } catch (e) {
      return false;
    }
  });

  // mobile drawer open state
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("sidebarCollapsed", sidebarCollapsed ? "true" : "false");
    } catch (e) {
      // ignore
    }
  }, [sidebarCollapsed]);

  const toggleSidebar = () => {
    // if on small screens, open/close mobile drawer
    if (window.innerWidth <= 900) {
      setMobileOpen((s) => !s);
      return;
    }

    setSidebarCollapsed((s) => !s);
  };

  const closeMobile = () => setMobileOpen(false);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <>
      <style>{`
        .admin-shell {
          display: flex;
          min-height: 100vh;
          background: var(--bg, linear-gradient(135deg, #f8fbff 0%, #f4f7fb 100%));
          color: var(--text, #0f172a);
        }

        .admin-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 100vh;
          overflow-y: auto;
        }

        @media (min-width: 901px) {
          .admin-main {
            padding-left: var(--sidebar-width, 260px);
          }
        }
      `}</style>
      <div
        className="admin-shell"
        data-theme={theme}
        style={{
          "--sidebar-width": sidebarCollapsed ? "72px" : "260px",
        }}
      >
      <Sidebar collapsed={sidebarCollapsed} mobileOpen={mobileOpen} onClose={closeMobile} />

      <div className="admin-main" style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}>
        <Header theme={theme} toggleTheme={toggleTheme} toggleSidebar={toggleSidebar} mobileOpen={mobileOpen} />

        <div
          style={{
            padding: "28px 28px 36px",
            flex: 1,
          }}
        >
          {children}
        </div>
      </div>

      {/* backdrop for mobile drawer */}
      {mobileOpen ? (
        <div
          onClick={closeMobile}
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.5)",
            zIndex: 60,
            backdropFilter: "blur(2px)",
          }}
        />
      ) : null}
      </div>
    </>
  );
}