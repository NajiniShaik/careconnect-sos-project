import { useState } from "react";

import RoleSelector from "../components/auth/RoleSelector";
import ResidentForm from "../components/auth/ResidentForm";
import GuardianForm from "../components/auth/GuardianForm";
import VolunteerForm from "../components/auth/VolunteerForm";
import SecurityForm from "../components/auth/SecurityForm";

function Register() {
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState("");

  const nextStep = () => setStep(step + 1);

  return (
    <div style={{ padding: "40px" }}>
      {step === 1 && (
        <RoleSelector
          selectedRole={selectedRole}
          setSelectedRole={setSelectedRole}
          onNext={nextStep}
        />
      )}

      {step === 2 && selectedRole === "RESIDENT" && (
        <ResidentForm />
      )}

      {step === 2 && selectedRole === "GUARDIAN" && (
        <GuardianForm />
      )}

      {step === 2 && selectedRole === "VOLUNTEER" && (
        <VolunteerForm />
      )}

      {step === 2 && selectedRole === "SECURITY" && (
        <SecurityForm />
      )}
    </div>
  );
}

export default Register;