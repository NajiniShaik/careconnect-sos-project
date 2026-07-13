export default function Modal({
    isOpen,
    title,
    children,
    onClose,
}) {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 999,
            }}
        >
            <div
                style={{
                    width: "500px",
                    background: "#fff",
                    borderRadius: "10px",
                    padding: "25px",
                    boxShadow: "0 5px 20px rgba(0,0,0,0.2)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "20px",
                    }}
                >
                    <h2>{title}</h2>

                    <button
                        onClick={onClose}
                        style={{
                            border: "none",
                            background: "transparent",
                            fontSize: "20px",
                            cursor: "pointer",
                        }}
                    >
                        ✕
                    </button>
                </div>

                {children}
            </div>
        </div>
    );
}