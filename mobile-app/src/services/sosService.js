export function buildSosRequestPayload(message = 'Emergency alert triggered from mobile app', location = 'UNKNOWN') {
  return {
    message,
    location,
  };
}

export function getSosStatusLabel(status) {
  switch (status?.toUpperCase()) {
    case 'PENDING':
      return 'Pending';
    case 'RESOLVED':
      return 'Resolved';
    case 'REJECTED':
      return 'Rejected';
    default:
      return 'Unknown';
  }
}

export async function triggerSosRequest() {
  const { api, getStoredToken } = await import('./authService.js');
  const token = await getStoredToken();

  return api.post(
    '/sos/trigger/',
    buildSosRequestPayload(),
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
}

export async function fetchSosHistory() {
  const { api, getStoredToken } = await import('./authService.js');
  const token = await getStoredToken();

  return api.get('/sos/trigger/', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
