import { useEffect, useState } from "react";
import { getBlocks } from "../../api/blockApi.js";

export default function FlatForm({
    initialData,
    onSubmit,
    onCancel,
}) {
    const [blocks, setBlocks] = useState([]);

    const [formData, setFormData] = useState(
        initialData || {
            block: "",
            flat_number: "",
            floor: "",
            flat_type: "2 BHK",
            is_occupied: false,
        }
    );

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    useEffect(() => {
        loadBlocks();
    }, []);

    const loadBlocks = async () => {
        try {
            const res = await getBlocks();
            setBlocks(res.data);
        } catch (err) {
            console.log(err);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData({
            ...formData,
            [name]:
                name === "is_occupied"
                    ? value === "true"
                    : value,
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gap: "14px" }}>
                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Block</label>
                    <select name="block" value={formData.block} onChange={handleChange} required style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box", background: "#fff" }}>
                        <option value="">Select Block</option>
                        {blocks.map((block) => (
                            <option key={block.id} value={block.id}>{block.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Flat Number</label>
                    <input type="text" name="flat_number" value={formData.flat_number} onChange={handleChange} required style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Floor</label>
                    <input type="number" name="floor" value={formData.floor} onChange={handleChange} required style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Type</label>
                    <select name="flat_type" value={formData.flat_type} onChange={handleChange} style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box", background: "#fff" }}>
                        <option>1 BHK</option>
                        <option>2 BHK</option>
                        <option>3 BHK</option>
                        <option>4 BHK</option>
                        <option>Studio</option>
                        <option>Villa</option>
                        <option>Penthouse</option>
                    </select>
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Occupied</label>
                    <select name="is_occupied" value={formData.is_occupied} onChange={handleChange} style={{ width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", boxSizing: "border-box", background: "#fff" }}>
                        <option value={false}>No</option>
                        <option value={true}>Yes</option>
                    </select>
                </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button type="button" onClick={onCancel} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>
                    Cancel
                </button>
                <button type="submit" style={{ border: "none", background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", borderRadius: "999px", padding: "10px 14px", cursor: "pointer", color: "#fff", fontWeight: 700 }}>
                    {initialData ? "Update Flat" : "Create Flat"}
                </button>
            </div>
        </form>
    );
}