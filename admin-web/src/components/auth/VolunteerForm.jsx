import { useState } from "react";
import axios from "axios";
import VerificationPending from "./VerificationPending";
import {
  validateCommonFields,
  validateVolunteer,
} from "../../utils/validation";

function VolunteerForm() {
  const [registered, setRegistered] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
    skills: "",
    availability: "",
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
    
    const volunteerError = validateVolunteer(formData);
    
    if (volunteerError) {
      alert(volunteerError);
      return;
    }

    try {
      const res = await axios.post(
        "http://127.0.0.1:8000/api/users/register/volunteer/",
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
      <h2>Volunteer Registration</h2>

      <input name="username" placeholder="Username" onChange={handleChange} />
      <br /><br />

      <input name="email" type="email" placeholder="Email" onChange={handleChange} />
      <br /><br />

      <input name="password" type="password" placeholder="Password" onChange={handleChange} />
      <br /><br />

      <input name="phone" placeholder="Phone Number" onChange={handleChange} />
      <br /><br />

      <input name="skills" placeholder="Skills" onChange={handleChange} />
      <br /><br />

      <input name="availability" placeholder="Availability" onChange={handleChange} />
      <br /><br />

      <button onClick={handleRegister}>Register</button>
    </div>
  );
}

export default VolunteerForm;