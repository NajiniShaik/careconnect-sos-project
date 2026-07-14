import Modal from "./Modal";

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
}) {
    return (
        <Modal
            isOpen={isOpen}
            title={title}
            onClose={onCancel}
        >
            <p style={{ color: "#475569", lineHeight: 1.6, margin: "0 0 16px" }}>{message}</p>

            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                    marginTop: "20px",
                }}
            >
                <button onClick={onCancel} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>
                    Cancel
                </button>

                <button onClick={onConfirm} style={{ border: "none", background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#fff", fontWeight: 700 }}>
                    Confirm
                </button>
            </div>
        </Modal>
    );
}