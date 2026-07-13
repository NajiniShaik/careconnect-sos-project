import { useState } from "react";
import axios from "axios";
import VerificationPending from "./VerificationPending";
import {
  validateCommonFields,
  validateSecurity,
} from "../../utils/validation";

function SecurityForm() {
  const [registered, setRegistered] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
    employee_id: "",
    shift: "",
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
    <div style={{ maxWidth: "500px", margin: "30px auto" }}>
      <h2>Security Registration</h2>

      <input name="username" placeholder="Username" onChange={handleChange} />
      <br /><br />

      <input name="email" type="email" placeholder="Email" onChange={handleChange} />
      <br /><br />

      <input name="password" type="password" placeholder="Password" onChange={handleChange} />
      <br /><br />

      <input name="phone" placeholder="Phone Number" onChange={handleChange} />
      <br /><br />

      <input name="employee_id" placeholder="Employee ID" onChange={handleChange} />
      <br /><br />

      <input name="shift" placeholder="Shift" onChange={handleChange} />
      <br /><br />

      <button onClick={handleRegister}>Register</button>
    </div>
  );
}

export default SecurityForm;
