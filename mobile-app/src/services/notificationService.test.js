import test from 'node:test';
import assert from 'node:assert/strict';

import { updateNotificationReadState } from './notificationService.js';

test('marks the matching notification as read without changing others', () => {
  const notifications = [
    { id: 1, read: false, title: 'First' },
    { id: 2, read: false, title: 'Second' },
    { id: 3, read: true, title: 'Third' },
  ];

  const next = updateNotificationReadState(notifications, 2);

  assert.deepEqual(next, [
    { id: 1, read: false, title: 'First' },
    { id: 2, read: true, title: 'Second' },
    { id: 3, read: true, title: 'Third' },
  ]);
});

test('returns the original list when there is no matching notification', () => {
  const notifications = [{ id: 1, read: false }];

  const next = updateNotificationReadState(notifications, 99);

  assert.equal(next, notifications);
});
