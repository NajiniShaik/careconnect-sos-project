import React from "react";

function RoleSelector({ selectedRole, setSelectedRole, onNext }) {
  const roles = [
    "RESIDENT",
    "GUARDIAN",
    "VOLUNTEER",
    "SECURITY",
  ];

  return (
    <div style={{ maxWidth: "400px", margin: "40px auto" }}>
      <h2>Select Your Role</h2>

      <select
        value={selectedRole}
        onChange={(e) => setSelectedRole(e.target.value)}
        style={{
          width: "100%",
          padding: "10px",
          marginTop: "20px",
          marginBottom: "20px",
        }}
      >
        <option value="">-- Select Role --</option>

        {roles.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>

      <button
        onClick={onNext}
        disabled={!selectedRole}
        style={{
          width: "100%",
          padding: "10px",
          cursor: selectedRole ? "pointer" : "not-allowed",
        }}
      >
        Next
      </button>
    </div>
  );
}

export default RoleSelector;