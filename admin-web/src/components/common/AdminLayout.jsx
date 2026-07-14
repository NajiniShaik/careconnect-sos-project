import Sidebar from "./Sidebar";
import Header from "./Header";
import { useEffect, useState } from "react";

export default function AdminLayout({ children }) {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div
      data-theme={theme}
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg, linear-gradient(135deg, #f8fbff 0%, #f4f7fb 100%))",
        color: "var(--text, #0f172a)",
      }}
    >
      <Sidebar />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <Header theme={theme} toggleTheme={toggleTheme} />

        <div
          style={{
            padding: "28px 28px 36px",
            flex: 1,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}