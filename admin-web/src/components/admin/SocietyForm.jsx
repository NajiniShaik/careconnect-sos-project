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
        <>
            <input
                name="name"
                placeholder="Society Name"
                value={formData.name}
                onChange={handleChange}
            />

            <br /><br />

            <input
                name="address"
                placeholder="Address"
                value={formData.address}
                onChange={handleChange}
            />

            <br /><br />

            <input
                name="city"
                placeholder="City"
                value={formData.city}
                onChange={handleChange}
            />

            <br /><br />

            <input
                name="state"
                placeholder="State"
                value={formData.state}
                onChange={handleChange}
            />

            <br /><br />

            <input
                name="pincode"
                placeholder="Pincode"
                value={formData.pincode}
                onChange={handleChange}
            />

            <br /><br />

            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                }}
            >
                <button onClick={onCancel}>
                    Cancel
                </button>

                <button onClick={handleSubmit}>
                    {initialData ? "Update Society" : "Create Society"}
                </button>
            </div>
        </>
    );
}