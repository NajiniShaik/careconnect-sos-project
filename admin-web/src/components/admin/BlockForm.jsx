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

            <div style={{ marginBottom: "15px" }}>
                <label>Block Name</label>
                <br />
                <input
                    type="text"
                    name="name"
                    placeholder="Enter Block Name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                />
            </div>

            <div style={{ marginBottom: "15px" }}>
                <label>Total Flats</label>
                <br />
                <input
                    type="number"
                    name="total_flats"
                    placeholder="Enter Total Flats"
                    value={formData.total_flats}
                    onChange={handleChange}
                    required
                    min="1"
                />
            </div>

            <div style={{ marginBottom: "20px" }}>
                <label>Society</label>
                <br />
                <select
                    name="society"
                    value={formData.society}
                    onChange={handleChange}
                    required
                >
                    <option value="">Select Society</option>

                    {societies.map((society) => (
                        <option
                            key={society.id}
                            value={society.id}
                        >
                            {society.name}
                        </option>
                    ))}
                </select>
            </div>

            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                }}
            >
                <button
                    type="button"
                    onClick={onCancel}
                >
                    Cancel
                </button>

                <button type="submit">
                    {initialData ? "Update Block" : "Create Block"}
                </button>
            </div>

        </form>
    );
}