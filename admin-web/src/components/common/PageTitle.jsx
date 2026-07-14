export default function PageTitle({ title, buttonText, onButtonClick, disabled }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "18px",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 800, color: "var(--text, #0f172a)" }}>{title}</h2>
      </div>

      {buttonText ? (
        <button
          onClick={disabled ? undefined : onButtonClick}
          disabled={disabled}
            style={{
            border: "none",
            background: disabled ? "var(--muted, #94a3b8)" : "linear-gradient(135deg, var(--primary) 0%, #1d4ed8 100%)",
            color: "white",
            padding: "10px 16px",
            borderRadius: "999px",
            cursor: disabled ? "not-allowed" : "pointer",
            fontWeight: 700,
            boxShadow: disabled ? "none" : "0 8px 18px rgba(37, 99, 235, 0.12)",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {buttonText}
        </button>
      ) : null}
    </div>
  );
}