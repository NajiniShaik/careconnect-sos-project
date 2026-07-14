import { useState } from "react";
import { loginUser } from "../api/authApi";
import { useNavigate, Link } from "react-router-dom";
import "./login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const navigate = useNavigate();

  const handleLogin = async () => {
    setFeedback({ type: "", message: "" });
    setIsLoading(true);

    try {
      const response = await loginUser({
        email,
        password,
      });

      localStorage.setItem("access", response.data.access);
      localStorage.setItem("refresh", response.data.refresh);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      localStorage.setItem("role", response.data.user.role);

      setFeedback({ type: "success", message: "Signed in successfully. Redirecting..." });
      setTimeout(() => navigate("/dashboard"), 400);
    } catch (error) {
      const message = error.response?.data?.detail || error.response?.data?.message || "Unable to sign in. Please check your email and password.";
      setFeedback({ type: "error", message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell auth-shell--simple">
        <section className="auth-card auth-card--centered">
          <div className="auth-form">
            <div className="auth-form-header">
              <h2>CareConnect Login</h2>
              <p>Sign in to access the admin dashboard.</p>
            </div>

            {feedback.message ? (
              <div className={`auth-message ${feedback.type}`}>{feedback.message}</div>
            ) : null}

            <input
              className="auth-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button className="auth-button" onClick={handleLogin} disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </button>

            <div className="auth-form-footer">
              <span>Need an account? </span>
              <Link to="/register" className="auth-link-button">Create one</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Login;