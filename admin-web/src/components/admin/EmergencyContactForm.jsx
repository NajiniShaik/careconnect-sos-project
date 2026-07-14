import { useEffect, useState } from "react";

export default function EmergencyContactForm({
    residents,
    initialData,
    onSubmit,
    onCancel,
}) {

    const role = localStorage.getItem("role");

    const [formData, setFormData] = useState({
        resident: "",
        name: "",
        phone: "",
        relationship: "",
        contact_type: "PRIMARY_GUARDIAN",
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                resident: initialData.resident,
                name: initialData.name,
                phone: initialData.phone,
                relationship: initialData.relationship,
                contact_type: initialData.contact_type,
            });
        }
    }, [initialData]);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const data = { ...formData };

        if (role === "RESIDENT") {
            delete data.resident;
        }

        onSubmit(data);
    };

    return (
        <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gap: "14px" }}>
                {role === "ADMIN" && (
                    <div>
                        <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Resident</label>
                        <select name="resident" value={formData.resident} onChange={handleChange} required style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box", background: "#fff" }}>
                            <option value="">Select Resident</option>
                            {residents.map((resident) => (
                                <option key={resident.id} value={resident.id}>{resident.username}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Contact Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Phone</label>
                    <input type="text" name="phone" value={formData.phone} onChange={handleChange} required style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Relationship</label>
                    <input type="text" name="relationship" value={formData.relationship} onChange={handleChange} required style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Contact Type</label>
                    <select name="contact_type" value={formData.contact_type} onChange={handleChange} style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box", background: "#fff" }}>
                        <option value="PRIMARY_GUARDIAN">Primary Guardian</option>
                        <option value="SECONDARY_GUARDIAN">Secondary Guardian</option>
                        <option value="EMERGENCY_CONTACT">Emergency Contact</option>
                    </select>
                </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button type="button" onClick={onCancel} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>
                    Cancel
                </button>
                <button type="submit" style={{ border: "none", background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#fff", fontWeight: 700 }}>
                    {initialData ? "Update" : "Create"}
                </button>
            </div>
        </form>
    );
}