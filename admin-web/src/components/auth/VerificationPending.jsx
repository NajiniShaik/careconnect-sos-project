import { useState } from "react";
import axios from "axios";
import SuccessScreen from "./SuccessScreen";

function VerificationPending({ username }) {
  const [otp, setOtp] = useState("");
  const [verified, setVerified] = useState(false);

  const verifyOTP = async () => {
    try {
      await axios.post(
        "http://127.0.0.1:8000/api/users/verify/",
        {
          username,
          otp,
        }
      );

      setVerified(true);
    } catch (err) {
      console.log(err.response?.data || err.message);
      alert("Invalid OTP");
    }
  };

  if (verified) {
    return <SuccessScreen />;
  }

  return (
    <div style={{ maxWidth: "400px", margin: "40px auto" }}>
      <h2>Verification Pending</h2>

      <p>Enter OTP (Use <b>123456</b>)</p>

      <input
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
        placeholder="Enter OTP"
      />

      <br /><br />

      <button onClick={verifyOTP}>
        Verify
      </button>
    </div>
  );
}

export default VerificationPending;
