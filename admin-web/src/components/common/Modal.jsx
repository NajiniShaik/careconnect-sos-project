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
                background: "rgba(15, 23, 42, 0.45)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 999,
                padding: "16px",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: "560px",
                    background: "#fff",
                    borderRadius: "18px",
                    padding: "24px",
                    boxShadow: "0 20px 45px rgba(15, 23, 42, 0.18)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "18px",
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: "20px", color: "#0f172a" }}>{title}</h2>

                    <button
                        onClick={onClose}
                        style={{
                            border: "none",
                            background: "#f1f5f9",
                            borderRadius: "999px",
                            width: "36px",
                            height: "36px",
                            fontSize: "18px",
                            cursor: "pointer",
                            color: "#475569",
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