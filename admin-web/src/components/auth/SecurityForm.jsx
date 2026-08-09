import { useState, useEffect } from "react";
import axios from "axios";
import VerificationPending from "./VerificationPending";
import { getSocieties } from "../../api/societyApi";
import {
  validateCommonFields,
  validateSecurity,
} from "../../utils/validation";

function SecurityForm() {
  const [registered, setRegistered] = useState(false);
  const [societies, setSocieties] = useState([]);
  const [loadingSocieties, setLoadingSocieties] = useState(true);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
    society: "",
    employee_id: "",
    shift: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  useEffect(() => {
    const loadSocieties = async () => {
      try {
        const societyRes = await getSocieties();
        setSocieties(societyRes.data);
      } catch (err) {
        console.error("Failed to load societies", err);
      } finally {
        setLoadingSocieties(false);
      }
    };

    loadSocieties();
  }, []);

  const handleRegister = async () => {

    const commonError = validateCommonFields(formData);
    if (commonError) {
      alert(commonError);
      return;
    }
    
    const securityError = validateSecurity(formData);
    
    if (securityError) {
      alert(securityError);
      return;
    }

    try {
      const res = await axios.post(
        "http://127.0.0.1:8000/api/users/register/security/",
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
    return <VerificationPending username={formData.username}/>
  }

  return (
    <div className="auth-form-inner">
      <h2 className="auth-form-title">Security Registration</h2>
      <input className="auth-input" name="username" placeholder="Username" onChange={handleChange} />
      <input className="auth-input" name="email" type="email" placeholder="Email" onChange={handleChange} />
      <input className="auth-input" name="password" type="password" placeholder="Password" onChange={handleChange} />
      <input className="auth-input" name="phone" placeholder="Phone Number" onChange={handleChange} />

      <select
        className="auth-select"
        name="society"
        value={formData.society}
        onChange={handleChange}
        disabled={loadingSocieties}
      >
        <option value="">
          {loadingSocieties ? "Loading societies..." : "Select Society"}
        </option>
        {societies.map((society) => (
          <option key={society.id} value={society.id}>
            {society.name}
          </option>
        ))}
      </select>

      <input className="auth-input" name="employee_id" placeholder="Employee ID" onChange={handleChange} />
      <input className="auth-input" name="shift" placeholder="Shift" onChange={handleChange} />
      <button className="auth-button" onClick={handleRegister}>Register</button>
    </div>
  );
}

export default SecurityForm;
