import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAuthHeaders } from './authHeaders.js';

test('builds authorization headers when a token exists', () => {
  assert.deepEqual(buildAuthHeaders('token-123'), {
    Authorization: 'Bearer token-123',
  });
});

test('returns empty headers when no token exists', () => {
  assert.deepEqual(buildAuthHeaders(), {});
});
