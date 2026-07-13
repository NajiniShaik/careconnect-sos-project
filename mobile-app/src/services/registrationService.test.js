import test from 'node:test';
import assert from 'node:assert/strict';

import { getRegistrationRequest } from './registrationService.js';

test('builds a resident registration request with society, block, and flat', () => {
  const result = getRegistrationRequest({
    username: 'alice',
    email: 'alice@example.com',
    password: 'secret123',
    phone: '9876543210',
    role: 'RESIDENT',
    society: '12',
    block: '3',
    flat: '5',
  });

  assert.equal(result.endpoint, '/users/register/resident/');
  assert.deepEqual(result.payload, {
    username: 'alice',
    email: 'alice@example.com',
    password: 'secret123',
    phone: '9876543210',
    role: 'RESIDENT',
    society: 12,
    block: 3,
    flat: 5,
  });
});

test('builds an admin registration request without extra profile fields', () => {
  const result = getRegistrationRequest({
    username: 'admin',
    email: 'admin@example.com',
    password: 'secret123',
    phone: '9876543210',
    role: 'ADMIN',
  });

  assert.equal(result.endpoint, '/users/register/');
  assert.deepEqual(result.payload, {
    username: 'admin',
    email: 'admin@example.com',
    password: 'secret123',
    phone: '9876543210',
    role: 'ADMIN',
  });
});
