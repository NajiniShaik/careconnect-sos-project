export default function DataTable({
    columns,
    data,
    renderActions,
    renderCell,
}) {
    return (
        <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f8fafc" }}>
                    <tr>
                        {columns.map((column) => (
                            <th key={column} style={{ padding: "14px 16px", textAlign: "left", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{column}</th>
                        ))}
                        {renderActions && <th style={{ padding: "14px 16px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Actions</th>}
                    </tr>
                </thead>

                <tbody>
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length + (renderActions ? 1 : 0)} style={{ padding: "28px 16px", textAlign: "center", color: "#64748b" }}>
                                No Records Found
                            </td>
                        </tr>
                    ) : (
                        data.map((item, index) => (
                            <tr key={item.id || `${item.name || "row"}-${index}`} style={{ borderTop: "1px solid #f1f5f9", background: index % 2 === 0 ? "#fff" : "#fbfdff" }}>
                                {columns.map((column) => (
                                    <td key={column} style={{ padding: "14px 16px", color: "#0f172a", fontSize: "14px" }}>
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