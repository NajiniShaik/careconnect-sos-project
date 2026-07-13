import { Link, useLocation } from "react-router-dom";

const menuItems = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "Society", path: "/societies" },
  { name: "Block / Towers", path: "/blocks" },
  { name: "Flats", path: "/flats" },
  { name: "Residents", path: "/residents" },
  { name: "Users", path: "/users" },
  { name: "Alerts", path: "/alerts" },
  { name: "Reports", path: "/reports" },
  { name: "Settings", path: "/settings" },
  {name:"Emergency Contacts",path:"/emergency-contacts"}
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <div
      style={{
        width: "240px",
        height: "100vh",
        background: "#172554",
        color: "white",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ marginBottom: "30px" }}>CareConnect Admin</h2>

      {menuItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          style={{
            display: "block",
            padding: "12px",
            marginBottom: "10px",
            borderRadius: "8px",
            textDecoration: "none",
            color: "white",
            background:
              location.pathname === item.path
                ? "#2563eb"
                : "transparent",
          }}
        >
          {item.name}
        </Link>
      ))}
    </div>
  );
}