import test from 'node:test';
import assert from 'node:assert/strict';

import { getAuthHeaders } from './authService.js';

test('builds authorization headers when a token exists', () => {
  assert.deepEqual(getAuthHeaders('token-123'), {
    Authorization: 'Bearer token-123',
  });
});

test('returns empty headers when no token exists', () => {
  assert.deepEqual(getAuthHeaders(), {});
});
