import React from "react";

function RoleSelector({ selectedRole, setSelectedRole, onNext }) {
  const roles = [
    "RESIDENT",
    "GUARDIAN",
    "VOLUNTEER",
    "SECURITY",
  ];

  return (
    <div>
      <div style={{ marginBottom: "14px" }}>
        <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, color: "#0f172a" }}>Choose your role</label>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="auth-select"
        >
          <option value="">-- Select Role --</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={onNext}
        disabled={!selectedRole}
        className="auth-button"
      >
        Continue
      </button>
    </div>
  );
}

export default RoleSelector;