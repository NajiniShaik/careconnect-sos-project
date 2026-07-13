export default function DataTable({
    columns,
    data,
    renderActions,
    renderCell,
}) {
    return (
        <table
            border="1"
            cellPadding="10"
            width="100%"
            style={{
                borderCollapse: "collapse",
                marginTop: "20px",
            }}
        >
            <thead>
                <tr>
                    {columns.map((column) => (
                        <th key={column}>{column}</th>
                    ))}
                    {renderActions && <th>Actions</th>}
                </tr>
            </thead>

            <tbody>
                {data.length === 0 ? (
                    <tr>
                        <td
                            colSpan={columns.length + (renderActions ? 1 : 0)}
                            align="center"
                        >
                            No Records Found
                        </td>
                    </tr>
                ) : (
                    data.map((item) => (
                        <tr key={item.id}>
                            {columns.map((column) => (
                                <td key={column}>
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
                                <td align="center">{renderActions(item)}</td>
                            )}
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    );
}