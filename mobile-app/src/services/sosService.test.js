import test from 'node:test';
import assert from 'node:assert/strict';

test('builds a request payload with default location', async () => {
  const { buildSosRequestPayload } = await import('./sosService.js');
  const payload = buildSosRequestPayload();
  assert.deepEqual(payload, {
    message: 'Emergency alert triggered from mobile app',
    location: 'UNKNOWN',
  });
});

test('maps status strings to readable labels', async () => {
  const { getSosStatusLabel } = await import('./sosService.js');
  assert.equal(getSosStatusLabel('PENDING'), 'Pending');
  assert.equal(getSosStatusLabel('RESOLVED'), 'Resolved');
  assert.equal(getSosStatusLabel('UNKNOWN'), 'Unknown');
});

test('normalizes a backend create response into a recent-alert event', async () => {
  const { normalizeSosEvent } = await import('./sosService.js');
  const event = normalizeSosEvent({ id: 7, status: 'OPEN', message: 'SOS triggered successfully' });

  assert.deepEqual(event, {
    id: 7,
    status: 'OPEN',
    message: 'SOS triggered successfully',
    location: 'Location unavailable',
    created_at: 'Just now',
  });
});

test('keeps a newly created SOS event when refreshed history is empty', async () => {
  const { mergeSosEvents, normalizeSosEvent } = await import('./sosService.js');
  const createdEvent = normalizeSosEvent({ id: 99, status: 'OPEN', message: 'SOS triggered successfully' });

  assert.deepEqual(mergeSosEvents(createdEvent, []), [createdEvent]);
});

test('passes an authorization header to SOS requests', async () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  const previousLocalStorage = global.localStorage;

  global.document = {};
  global.window = {};
  global.localStorage = {
    getItem(key) {
      return key === 'access' ? 'token-123' : null;
    },
    setItem() {},
    removeItem() {},
  };

  const { api } = await import('./authService.js');
  const { triggerSosRequest } = await import('./sosService.js');

  const originalPost = api.post;
  let capturedConfig;

  api.post = async (_url, _payload, config) => {
    capturedConfig = config;
    return { data: {} };
  };

  try {
    await triggerSosRequest({ message: 'Test alert', location: 'Home' });
    assert.deepEqual(capturedConfig.headers, {
      Authorization: 'Bearer token-123',
    });
  } finally {
    api.post = originalPost;
    global.document = previousDocument;
    global.window = previousWindow;
    global.localStorage = previousLocalStorage;
  }
});
