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

            {role === "ADMIN" && (
                <>
                    <label>Resident</label>
                    <br />

                    <select
                        name="resident"
                        value={formData.resident}
                        onChange={handleChange}
                        required
                    >
                        <option value="">Select Resident</option>

                        {residents.map((resident) => (
                            <option
                                key={resident.id}
                                value={resident.id}
                            >
                                {resident.username}
                            </option>
                        ))}
                    </select>

                    <br /><br />
                </>
            )}

            <label>Contact Name</label>
            <br />

            <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
            />

            <br /><br />

            <label>Phone</label>
            <br />

            <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
            />

            <br /><br />

            <label>Relationship</label>
            <br />

            <input
                type="text"
                name="relationship"
                value={formData.relationship}
                onChange={handleChange}
                required
            />

            <br /><br />

            <label>Contact Type</label>
            <br />

            <select
                name="contact_type"
                value={formData.contact_type}
                onChange={handleChange}
            >
                <option value="PRIMARY_GUARDIAN">
                    Primary Guardian
                </option>

                <option value="SECONDARY_GUARDIAN">
                    Secondary Guardian
                </option>

                <option value="EMERGENCY_CONTACT">
                    Emergency Contact
                </option>
            </select>

            <br /><br />

            <button type="submit">
                {initialData ? "Update" : "Create"}
            </button>

            <button
                type="button"
                onClick={onCancel}
                style={{ marginLeft: 10 }}
            >
                Cancel
            </button>

        </form>
    );
}