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
        border: "1px solid #cbd5e1",
        background: "#fff",
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        outline: "none",
      }}
    />
  );
}