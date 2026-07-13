export function buildAuthHeaders(token = null) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
