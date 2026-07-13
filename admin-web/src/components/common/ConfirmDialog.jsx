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
            <p>{message}</p>

            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                    marginTop: "20px",
                }}
            >
                <button onClick={onCancel}>
                    Cancel
                </button>

                <button onClick={onConfirm}>
                    Delete
                </button>
            </div>
        </Modal>
    );
}