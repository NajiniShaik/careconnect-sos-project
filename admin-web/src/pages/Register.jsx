import { useState } from "react";
import { Link } from "react-router-dom";

import RoleSelector from "../components/auth/RoleSelector";
import ResidentForm from "../components/auth/ResidentForm";
import GuardianForm from "../components/auth/GuardianForm";
import VolunteerForm from "../components/auth/VolunteerForm";
import SecurityForm from "../components/auth/SecurityForm";
import "./login.css";

function Register() {
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState("");

  const nextStep = () => setStep(step + 1);

  return (
    <div className="auth-page">
      <div className="auth-shell auth-shell--simple">
        <section className="auth-card auth-card--centered">
          <div className="auth-form">
            {step === 1 && (
              <>
                <div className="auth-form-header">
                  <h2>Create your account</h2>
                  <p>Choose your role from the list below to start registration.</p>
                </div>

                <RoleSelector
                  selectedRole={selectedRole}
                  setSelectedRole={setSelectedRole}
                  onNext={nextStep}
                />
              </>
            )}

            {step === 2 && selectedRole === "RESIDENT" && <ResidentForm />}
            {step === 2 && selectedRole === "GUARDIAN" && <GuardianForm />}
            {step === 2 && selectedRole === "VOLUNTEER" && <VolunteerForm />}
            {step === 2 && selectedRole === "SECURITY" && <SecurityForm />}

            <div className="auth-form-footer">
              <Link to="/" className="auth-link-button">← Back to login</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Register;