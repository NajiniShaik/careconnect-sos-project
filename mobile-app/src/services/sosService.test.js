import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSosRequestPayload, getSosStatusLabel } from './sosService.js';

test('builds a request payload with default location', () => {
  const payload = buildSosRequestPayload();
  assert.deepEqual(payload, {
    message: 'Emergency alert triggered from mobile app',
    location: 'UNKNOWN',
  });
});

test('maps status strings to readable labels', () => {
  assert.equal(getSosStatusLabel('PENDING'), 'Pending');
  assert.equal(getSosStatusLabel('RESOLVED'), 'Resolved');
  assert.equal(getSosStatusLabel('UNKNOWN'), 'Unknown');
});
