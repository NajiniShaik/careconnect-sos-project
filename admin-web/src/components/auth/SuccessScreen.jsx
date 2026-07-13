import { useNavigate } from "react-router-dom";

function SuccessScreen() {
  const navigate = useNavigate();

  return (
    <div style={{ textAlign: "center", marginTop: "80px" }}>
      <h1>Registration Successful 🎉</h1>

      <p>Your account has been verified.</p>

      <button onClick={() => navigate("/")}>
        Go to Login
      </button>
    </div>
  );
}

export default SuccessScreen;

