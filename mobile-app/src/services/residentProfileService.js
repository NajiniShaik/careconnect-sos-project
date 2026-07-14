export function getEmergencyContactVerificationState(contact, overrideState) {
  if (overrideState) {
    return overrideState;
  }

  if (contact?.is_verified) {
    return "verified";
  }

  return "pending";
}

export function buildResidentProfileViewModel(authUser, residentProfile, emergencyContacts) {
  const normalizedContacts = Array.isArray(emergencyContacts)
    ? emergencyContacts.map((contact) => {
        const verificationState = getEmergencyContactVerificationState(contact);

        return {
          ...contact,
          verificationState,
          verificationLabel: verificationState === "verified" ? "Verified" : "Pending",
          verificationTone: verificationState === "verified" ? "success" : "warning",
        };
      })
    : [];

  return {
    username: residentProfile?.username || authUser?.username || "N/A",
    email: residentProfile?.email || authUser?.email || "N/A",
    phone: residentProfile?.phone || authUser?.phone || "N/A",
    role: authUser?.role || residentProfile?.role || "RESIDENT",
    society: residentProfile?.society_name || residentProfile?.society || "Not available",
    block: residentProfile?.block_name || residentProfile?.block || "Not available",
    flat: residentProfile?.flat_number || residentProfile?.flat || "Not available",
    approvalStatus: residentProfile?.approval_status || residentProfile?.approvalStatus || "PENDING",
    emergencyContacts: normalizedContacts,
  };
}
