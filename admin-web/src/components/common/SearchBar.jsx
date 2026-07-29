export default function SearchBar({
  value,
  onChange,
  placeholder = "Search..."
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width: "300px",
        padding: "11px 14px",
        marginBottom: "20px",
        borderRadius: "12px",
        border: "1px solid var(--border)",
        background: "var(--input-bg)",
        boxShadow: "var(--glass-shadow)",
        outline: "none",
      }}
    />
  );
}