import { useEffect, useMemo, useState } from "react";

export default function ResidentForm({
  societies,
  blocks,
  flats,
  onSubmit,
  onCancel,
}) {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
    society: "",
    block: "",
    flat: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: value,
      };

      // Reset dependent dropdowns
      if (name === "society") {
        updated.block = "";
        updated.flat = "";
      }

      if (name === "block") {
        updated.flat = "";
      }

      return updated;
    });
  };

  const filteredBlocks = useMemo(() => {
    if (!formData.society) return [];
    return blocks.filter(
      (block) => String(block.society) === String(formData.society)
    );
  }, [blocks, formData.society]);

  const filteredFlats = useMemo(() => {
    if (!formData.block) return [];
    return flats.filter(
      (flat) => String(flat.block) === String(formData.block)
    );
  }, [flats, formData.block]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 15 }}>
        <label>Username</label>

        <input
          type="text"
          name="username"
          value={formData.username}
          onChange={handleChange}
          required
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 15 }}>
        <label>Email</label>

        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 15 }}>
        <label>Phone</label>

        <input
          type="text"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          required
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 15 }}>
        <label>Password</label>

        <input
          type="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          required
          style={{ width: "100%", padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 15 }}>
        <label>Society</label>

        <select
          name="society"
          value={formData.society}
          onChange={handleChange}
          required
          style={{ width: "100%", padding: 8 }}
        >
          <option value="">Select Society</option>

          {societies.map((society) => (
            <option key={society.id} value={society.id}>
              {society.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 15 }}>
        <label>Block</label>

        <select
          name="block"
          value={formData.block}
          onChange={handleChange}
          required
          disabled={!formData.society}
          style={{ width: "100%", padding: 8 }}
        >
          <option value="">Select Block</option>

          {filteredBlocks.map((block) => (
            <option key={block.id} value={block.id}>
              {block.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label>Flat</label>

        <select
          name="flat"
          value={formData.flat}
          onChange={handleChange}
          required
          disabled={!formData.block}
          style={{ width: "100%", padding: 8 }}
        >
          <option value="">Select Flat</option>

          {filteredFlats.map((flat) => (
            <option key={flat.id} value={flat.id}>
              {flat.flat_number}
            </option>
          ))}
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
          Register Resident
        </button>
      </div>
    </form>
  );
}