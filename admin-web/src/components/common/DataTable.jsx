export default function DataTable({
    columns,
    data,
    renderActions,
    renderCell,
}) {
    return (
        <div className="glass-panel" style={{ borderRadius: "16px", overflow: "hidden", boxShadow: "var(--glass-shadow)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "var(--surface-muted)" }}>
                    <tr>
                        {columns.map((column) => (
                            <th key={column} style={{ padding: "14px 16px", textAlign: "left", fontSize: "12px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--border)" }}>{column}</th>
                        ))}
                        {renderActions && <th style={{ padding: "14px 16px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--border)" }}>Actions</th>}
                    </tr>
                </thead>

                <tbody>
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length + (renderActions ? 1 : 0)} style={{ padding: "28px 16px", textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
                                No Records Found
                            </td>
                        </tr>
                    ) : (
                        data.map((item, index) => (
                            <tr key={item.id || `${item.name || "row"}-${index}`} style={{ borderTop: "1px solid var(--border)", background: index % 2 === 0 ? "transparent" : "var(--table-hover)" }}>
                                {columns.map((column) => (
                                    <td key={column} style={{ padding: "14px 16px", color: "var(--text)", fontSize: "14px" }}>
                                        {renderCell ? (
                                            renderCell(item, column)
                                        ) : typeof item[column.toLowerCase()] === "boolean" ? (
                                            item[column.toLowerCase()] ? "Yes" : "No"
                                        ) : (
                                            item[column.toLowerCase()]
                                        )}
                                    </td>
                                ))}

                                {renderActions && (
                                    <td style={{ padding: "14px 16px", textAlign: "right" }}>{renderActions(item)}</td>
                                )}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}