import Modal from "./Modal";

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmLabel = "Confirm",
    confirmLoading = false,
}) {
    return (
        <Modal
            isOpen={isOpen}
            title={title}
            onClose={onCancel}
        >
            <p style={{ color: "var(--muted)", lineHeight: 1.6, margin: "0 0 16px" }}>{message}</p>

            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                    marginTop: "20px",
                }}
            >
                <button onClick={onCancel} style={{ border: "1px solid var(--border)", background: "var(--surface-mutated)", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "var(--text)", fontWeight: 700 }}>
                    Cancel
                </button>

                <button onClick={onConfirm} disabled={confirmLoading} style={{ border: "none", background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)", borderRadius: "999px", padding: "10px 14px", cursor: confirmLoading ? "not-allowed" : "pointer", color: "#fff", fontWeight: 700 }}>
                    {confirmLoading ? "Deleting..." : confirmLabel}
                </button>
            </div>
        </Modal>
    );
}