export default function FilterBar({
    search,
    setSearch,
    filter,
    setFilter,
    filterOptions = [],
    placeholder = "Search..."
}) {
    const handleClear = () => {
        setSearch("");
        if (filterOptions.length > 0) {
            setFilter(filterOptions[0].value);
        }
    };

    return (
        <div style={{ display: "flex", gap: "12px", marginBottom: "18px", alignItems: "center", flexWrap: "wrap" }}>
            <input
                type="text"
                placeholder={placeholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: "1 1 260px", minWidth: "220px", padding: "11px 14px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#fff", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}
            />

            <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ padding: "11px 14px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", minWidth: "160px" }}
            >
                {filterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>

            <button
                onClick={handleClear}
                style={{ padding: "10px 14px", cursor: "pointer", backgroundColor: "#e2e8f0", color: "#0f172a", border: "none", borderRadius: "999px", fontWeight: 700 }}
            >
                Clear
            </button>
        </div>
    );
}