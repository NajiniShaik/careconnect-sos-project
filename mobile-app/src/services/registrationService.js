export function getRegistrationRequest(form) {
  const payload = {
    username: (form.username || '').trim(),
    email: (form.email || '').trim(),
    password: form.password,
    phone: (form.phone || '').trim(),
    role: form.role,
  };

  const endpoint = {
    RESIDENT: '/users/register/resident/',
    GUARDIAN: '/users/register/guardian/',
    VOLUNTEER: '/users/register/volunteer/',
    SECURITY: '/users/register/security/',
    ADMIN: '/users/register/',
  }[form.role];

  const extraPayload = {
    RESIDENT: {
      society: Number(form.society),
      block: Number(form.block),
      flat: Number(form.flat),
    },
    GUARDIAN: {
      resident_name: (form.resident_name || '').trim(),
      relationship: (form.relationship || '').trim(),
    },
    VOLUNTEER: {
      skills: (form.skills || '').trim(),
      availability: (form.availability || '').trim(),
    },
    SECURITY: {
      employee_id: (form.employee_id || '').trim(),
      shift: (form.shift || '').trim(),
    },
    ADMIN: {},
  }[form.role];

  return {
    endpoint,
    payload: { ...payload, ...extraPayload },
  };
}
