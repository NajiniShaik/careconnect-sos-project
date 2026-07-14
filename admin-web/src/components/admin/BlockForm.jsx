import { useState, useEffect } from "react";

export default function BlockForm({
    onSubmit,
    onCancel,
    initialData,
    societies,
}) {
    const [formData, setFormData] = useState(
        initialData || {
            name: "",
            total_flats: "",
            society: "",
        }
    );

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                name: "",
                total_flats: "",
                society: "",
            });
        }
    }, [initialData]);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        onSubmit({
            ...formData,
            total_flats: Number(formData.total_flats),
        });
    };

    return (
        <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gap: "14px" }}>
                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Block Name</label>
                    <input type="text" name="name" placeholder="Enter Block Name" value={formData.name} onChange={handleChange} required style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Total Flats</label>
                    <input type="number" name="total_flats" placeholder="Enter Total Flats" value={formData.total_flats} onChange={handleChange} required min="1" style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Society</label>
                    <select name="society" value={formData.society} onChange={handleChange} required style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box", background: "#fff" }}>
                        <option value="">Select Society</option>
                        {societies.map((society) => (
                            <option key={society.id} value={society.id}>{society.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" onClick={onCancel} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>
                    Cancel
                </button>
                <button type="submit" style={{ border: "none", background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#fff", fontWeight: 700 }}>
                    {initialData ? "Update Block" : "Create Block"}
                </button>
            </div>
        </form>
    );
}