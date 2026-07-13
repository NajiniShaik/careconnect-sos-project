export default function Header() {
  return (
    <div
      style={{
        height: "70px",
        background: "white",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 30px",
        borderBottom: "1px solid #e5e7eb",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ margin: 0 }}>CareConnect Admin</h2>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "15px",
        }}
      >
        <span>🔔</span>

        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: "#2563eb",
            color: "white",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontWeight: "bold",
          }}
        >
          A
        </div>

        <div>
          <div style={{ fontWeight: "bold" }}>Admin User</div>
          <div style={{ fontSize: "12px", color: "gray" }}>
            Super Admin
          </div>
        </div>
      </div>
    </div>
  );
}