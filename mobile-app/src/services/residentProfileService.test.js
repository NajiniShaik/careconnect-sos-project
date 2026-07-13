import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResidentProfileViewModel, getEmergencyContactVerificationState } from './residentProfileService.js';

test('derives verified and pending states for emergency contacts', () => {
  const profile = buildResidentProfileViewModel(
    { username: 'alice' },
    { username: 'alice' },
    [
      { id: 1, name: 'Mom', is_verified: true },
      { id: 2, name: 'Dad', is_verified: false },
    ]
  );

  assert.equal(profile.emergencyContacts[0].verificationState, 'verified');
  assert.equal(profile.emergencyContacts[0].verificationLabel, 'Verified');
  assert.equal(profile.emergencyContacts[1].verificationState, 'pending');
  assert.equal(profile.emergencyContacts[1].verificationLabel, 'Pending');
});

test('overrides state when a verification request fails', () => {
  const state = getEmergencyContactVerificationState({ id: 2, is_verified: false }, 'failed');
  assert.equal(state, 'failed');
});
