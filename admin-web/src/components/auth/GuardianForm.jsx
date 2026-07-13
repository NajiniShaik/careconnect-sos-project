import { useState } from "react";
import axios from "axios";
import VerificationPending from "./VerificationPending";
import {
  validateCommonFields,
  validateGuardian,
} from "../../utils/validation";

function GuardianForm() {
  const [registered, setRegistered] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
    resident_name: "",
    relationship: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleRegister = async () => {
    const commonError = validateCommonFields(formData);
    if (commonError) {
      alert(commonError);
      return;
    }
    
    const guardianError = validateGuardian(formData);
    if (guardianError) {
      alert(guardianError);
      return;
    }

    try {
      const res = await axios.post(
        "http://127.0.0.1:8000/api/users/register/guardian/",
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
    <div style={{ maxWidth: "500px", margin: "30px auto" }}>
      <h2>Guardian Registration</h2>

      <input
        name="username"
        placeholder="Username"
        onChange={handleChange}
      />
      <br /><br />

      <input
        name="email"
        type="email"
        placeholder="Email"
        onChange={handleChange}
      />
      <br /><br />

      <input
        name="password"
        type="password"
        placeholder="Password"
        onChange={handleChange}
      />
      <br /><br />

      <input
        name="phone"
        placeholder="Phone Number"
        onChange={handleChange}
      />
      <br /><br />

      <input
        name="resident_name"
        placeholder="Resident Name"
        onChange={handleChange}
      />
      <br /><br />

      <input
        name="relationship"
        placeholder="Relationship"
        onChange={handleChange}
      />
      <br /><br />

      <button onClick={handleRegister}>
        Register
      </button>
    </div>
  );
}

export default GuardianForm;