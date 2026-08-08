export function getPostLoginRoute(user, authState = {}) {
  const role = user?.role;
  if (role === 'SECURITY') {
    return '/dashboard';
  }

  if (role === 'RESIDENT') {
    return '/dashboard';
  }

  return '/dashboard';
}
