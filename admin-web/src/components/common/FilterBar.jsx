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
        <div style={{ display: "flex", gap: "15px", marginBottom: "20px", alignItems: "center" }}>
            {/* 🔍 Search text input - instantly updates parent state */}
            <input
                type="text"
                placeholder={placeholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
            />

            {/* 📋 Filter dropdown - instantly updates parent state */}
            <select
                value={filter}
                onChange={(e) => (
                    setFilter(e.target.value)
                )}
                style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
            >
                {filterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>

            {/* 🧹 Clear Button */}
            <button
                onClick={handleClear}
                style={{ padding: "8px 12px", cursor: "pointer", backgroundColor: "#6c757d", color: "#fff", border: "none", borderRadius: "4px" }}
            >
                Clear
            </button>
        </div >
    );
}