import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSosRequestPayload, getSosStatusLabel, mergeSosEvents, normalizeSosEvent } from './sosService.js';

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

test('normalizes a backend create response into a recent-alert event', () => {
  const event = normalizeSosEvent({ id: 7, status: 'OPEN', message: 'SOS triggered successfully' });

  assert.deepEqual(event, {
    id: 7,
    status: 'OPEN',
    message: 'SOS triggered successfully',
    location: 'Location unavailable',
    created_at: 'Just now',
  });
});

test('keeps a newly created SOS event when refreshed history is empty', () => {
  const createdEvent = normalizeSosEvent({ id: 99, status: 'OPEN', message: 'SOS triggered successfully' });

  assert.deepEqual(mergeSosEvents(createdEvent, []), [createdEvent]);
});
