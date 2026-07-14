import test from 'node:test';
import assert from 'node:assert/strict';

import { getApiBaseUrl, getAuthHeaders } from './authService.js';

test('uses a shared API base URL from runtime configuration when available', () => {
  const override = 'shared-base';
  process.env.EXPO_PUBLIC_API_BASE_URL = override;
  assert.equal(getApiBaseUrl(), override);
});

test('builds authorization headers when a token exists', async () => {
  assert.deepEqual(await getAuthHeaders('token-123'), {
    Authorization: 'Bearer token-123',
  });
});

test('returns empty headers when no token exists', async () => {
  assert.deepEqual(await getAuthHeaders(), {});
});
