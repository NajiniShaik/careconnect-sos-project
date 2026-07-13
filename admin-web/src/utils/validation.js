export function validateCommonFields(formData) {
  if (!formData.username.trim()) {
    return "Username is required";
  }

  if (!formData.email.trim()) {
    return "Email is required";
  }

  if (!/\S+@\S+\.\S+/.test(formData.email)) {
    return "Enter a valid email";
  }

  if (!formData.password.trim()) {
    return "Password is required";
  }

  if (formData.password.length < 6) {
    return "Password must be at least 6 characters";
  }

  if (!formData.phone.trim()) {
    return "Phone number is required";
  }

  if (!/^\d{10}$/.test(formData.phone)) {
    return "Phone number must contain exactly 10 digits";
  }

  return null;
}

export function validateResident(formData) {
  if (!formData.society) {
    return "Please select a society";
  }

  if (!formData.block) {
    return "Please select a block";
  }

  if (!formData.flat) {
    return "Please select a flat";
  }

  return null;
}

export function validateGuardian(formData) {
  if (!formData.resident_name.trim()) {
    return "Resident Name is required";
  }

  if (!formData.relationship.trim()) {
    return "Relationship is required";
  }

  return null;
}

export function validateVolunteer(formData) {
  if (!formData.skills.trim()) {
    return "Skills are required";
  }

  if (!formData.availability.trim()) {
    return "Availability is required";
  }

  return null;
}

export function validateSecurity(formData) {
  if (!formData.employee_id.trim()) {
    return "Employee ID is required";
  }

  if (!formData.shift.trim()) {
    return "Shift is required";
  }

  return null;
}
