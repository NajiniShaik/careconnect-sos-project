import { useState, useEffect } from "react";

import axios from "axios";
import VerificationPending from "./VerificationPending";

import { getSocieties } from "../../api/societyApi";
import { getBlocks } from "../../api/blockApi";
import { getFlats } from "../../api/flatApi";

import {
  validateCommonFields,
  validateResident,
} from "../../utils/validation";

function ResidentForm() {
  const [registered, setRegistered] = useState(false);

  const [societies, setSocieties] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [flats, setFlats] = useState([]);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
    society: "",
    block: "",
    flat: "",
  });

  const filteredBlocks = blocks.filter(
    (block) => String(block.society) === formData.society
  );

  const filteredFlats = flats.filter(
    (flat) => String(flat.block) === formData.block
  );

  useEffect(() => {
    const loadData = async () => {
      const societyRes = await getSocieties();
      const blockRes = await getBlocks();
      const flatRes = await getFlats();

      setSocieties(societyRes.data);
      setBlocks(blockRes.data);
      setFlats(flatRes.data);
    };

    loadData();
  }, []);


  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "society") {
      setFormData({
        ...formData,
        society: value,
        block: "",
        flat: "",
      });
      return;
    }

    if (name === "block") {
      setFormData({
        ...formData,
        block: value,
        flat: "",
      });
      return;
    }

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleRegister = async () => {

    const commonError = validateCommonFields(formData);
    if (commonError) {
      alert(commonError);
      return;
    }
    const residentError = validateResident(formData);

    if (residentError) {
      alert(residentError);
      return;
    }

    try {
      const res = await axios.post(
        "http://127.0.0.1:8000/api/users/register/resident/",
        formData
      );

      console.log(res.data);
      setRegistered(true);
    } catch (err) {
      console.log(err.response?.data || err.message);
      alert("Registration Failed");
    }
  };

  if (registered) {
    return <VerificationPending username={formData.username} />
  }

  return (
    <div className="auth-form-inner">
      <h2 className="auth-form-title">Resident Registration</h2>
      <input
        className="auth-input"
        name="username"
        placeholder="Username"
        onChange={handleChange}
      />

      <input
        className="auth-input"
        name="email"
        type="email"
        placeholder="Email"
        onChange={handleChange}
      />

      <input
        className="auth-input"
        name="password"
        type="password"
        placeholder="Password"
        onChange={handleChange}
      />

      <input
        className="auth-input"
        name="phone"
        placeholder="Phone Number"
        onChange={handleChange}
      />

      <select
        className="auth-select"
        name="society"
        value={formData.society}
        onChange={handleChange}
      >
        <option value="">Select Society</option>
        {societies.map((society) => (
          <option key={society.id} value={society.id}>{society.name}</option>
        ))}
      </select>

      <select
        className="auth-select"
        name="block"
        value={formData.block}
        onChange={handleChange}
      >
        <option value="">Select Block</option>
        {filteredBlocks.map((block) => (
          <option key={block.id} value={block.id}>{block.name}</option>
        ))}
      </select>

      <select
        className="auth-select"
        name="flat"
        value={formData.flat}
        onChange={handleChange}
      >
        <option value="">Select Flat</option>
        {filteredFlats.map((flat) => (
          <option key={flat.id} value={flat.id}>{flat.flat_number}</option>
        ))}
      </select>

      <button className="auth-button" onClick={handleRegister}>Register</button>
    </div>
  );
}

export default ResidentForm;