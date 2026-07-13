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
        padding: "10px",
        marginBottom: "20px",
        borderRadius: "8px",
        border: "1px solid #ccc",
      }}
    />
  );
}