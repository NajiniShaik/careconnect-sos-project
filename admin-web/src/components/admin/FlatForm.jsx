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

            <div style={{ marginBottom: 15 }}>
                <label>Block</label>
                <br />

                <select
                    name="block"
                    value={formData.block}
                    onChange={handleChange}
                    required
                >
                    <option value="">Select Block</option>

                    {blocks.map((block) => (
                        <option
                            key={block.id}
                            value={block.id}
                        >
                            {block.name}
                        </option>
                    ))}
                </select>
            </div>

            <div style={{ marginBottom: 15 }}>
                <label>Flat Number</label>
                <br />

                <input
                    type="text"
                    name="flat_number"
                    value={formData.flat_number}
                    onChange={handleChange}
                    required
                />
            </div>

            <div style={{ marginBottom: 15 }}>
                <label>Floor</label>
                <br />

                <input
                    type="number"
                    name="floor"
                    value={formData.floor}
                    onChange={handleChange}
                    required
                />
            </div>

            <div style={{ marginBottom: 15 }}>
                <label>Type</label>
                <br />

                <select
                    name="flat_type"
                    value={formData.flat_type}
                    onChange={handleChange}
                >
                    <option>1 BHK</option>
                    <option>2 BHK</option>
                    <option>3 BHK</option>
                    <option>4 BHK</option>
                    <option>Studio</option>
                    <option>Villa</option>
                    <option>Penthouse</option>
                </select>
            </div>

            <div style={{ marginBottom: 20 }}>
                <label>Occupied</label>
                <br />

                <select
                    name="is_occupied"
                    value={formData.is_occupied}
                    onChange={handleChange}
                >
                    <option value={false}>No</option>
                    <option value={true}>Yes</option>
                </select>
            </div>

            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                }}
            >
                <button
                    type="button"
                    onClick={onCancel}
                >
                    Cancel
                </button>

                <button type="submit">
                    {initialData
                        ? "Update Flat"
                        : "Create Flat"}
                </button>
            </div>

        </form>
    );
}