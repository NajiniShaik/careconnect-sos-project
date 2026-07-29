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
                style={{ flex: "1 1 260px", minWidth: "220px", padding: "11px 14px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--input-bg)", boxShadow: "var(--glass-shadow)" }}
            />

            <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ padding: "11px 14px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", minWidth: "160px" }}
            >
                {filterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>

            <button
                onClick={handleClear}
                style={{ padding: "10px 14px", cursor: "pointer", backgroundColor: "var(--surface-muted)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "999px", fontWeight: 700 }}
            >
                Clear
            </button>
        </div>
    );
}