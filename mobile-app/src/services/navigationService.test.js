import test from 'node:test';
import assert from 'node:assert/strict';

import { getPostLoginRoute } from './navigationService.js';

test('sends residents with completed setup to dashboard', () => {
  assert.equal(
    getPostLoginRoute({ role: 'RESIDENT' }, { residentSetupComplete: true }),
    '/dashboard'
  );
});

test('keeps residents on dashboard even without a completed setup flag', () => {
  assert.equal(
    getPostLoginRoute({ role: 'RESIDENT' }, { residentSetupComplete: false }),
    '/dashboard'
  );
});

test('treats residents with stored mapping values as setup-complete', () => {
  assert.equal(
    getPostLoginRoute({ role: 'RESIDENT' }, { society: '1', block: '2', flat: '3' }),
    '/dashboard'
  );
});

test('sends non-residents straight to dashboard', () => {
  assert.equal(getPostLoginRoute({ role: 'ADMIN' }, {}), '/dashboard');
});
