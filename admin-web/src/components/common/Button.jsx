function Button({ children, variant = "primary", ...props }) {
  const isSecondary = variant === "secondary";

  return (
    <button
      {...props}
      style={{
        border: "none",
        borderRadius: "999px",
        padding: "10px 14px",
        fontWeight: 700,
        cursor: "pointer",
        background: isSecondary ? "#e2e8f0" : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
        color: isSecondary ? "#0f172a" : "#ffffff",
        boxShadow: isSecondary ? "none" : "0 8px 18px rgba(37, 99, 235, 0.2)",
      }}
    >
      {children}
    </button>
  );
}

export default Button;