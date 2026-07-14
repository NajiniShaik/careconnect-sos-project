import { useState, useEffect } from "react";

export default function SocietyForm({ onSubmit, onCancel, initialData }) {

    const [formData, setFormData] = useState(
        initialData || {
            name: "",
            address: "",
            city: "",
            state: "",
            pincode: "",
        }
    );
    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                name: "",
                address: "",
                city: "",
                state: "",
                pincode: "",
            });
        }
    }, [initialData]);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = () => {
        onSubmit(formData);

        setFormData({
            name: "",
            address: "",
            city: "",
            state: "",
            pincode: "",
        });
    };

    return (
        <div style={{ display: "grid", gap: "14px" }}>
            <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Society Name</label>
                <input name="name" placeholder="Society Name" value={formData.name} onChange={handleChange} style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
            </div>

            <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Address</label>
                <input name="address" placeholder="Address" value={formData.address} onChange={handleChange} style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
            </div>

            <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>City</label>
                <input name="city" placeholder="City" value={formData.city} onChange={handleChange} style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
            </div>

            <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>State</label>
                <input name="state" placeholder="State" value={formData.state} onChange={handleChange} style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
            </div>

            <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Pincode</label>
                <input name="pincode" placeholder="Pincode" value={formData.pincode} onChange={handleChange} style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
                <button onClick={onCancel} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>
                    Cancel
                </button>

                <button onClick={handleSubmit} style={{ border: "none", background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#fff", fontWeight: 700 }}>
                    {initialData ? "Update Society" : "Create Society"}
                </button>
            </div>
        </div>
    );
}