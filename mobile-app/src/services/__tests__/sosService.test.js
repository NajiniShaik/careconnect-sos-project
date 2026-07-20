/* global describe it expect */
import { mergeSosMessages } from '../sosService';

describe('mergeSosMessages', () => {
  it('appends a new message and avoids duplicates', () => {
    const existing = [
      { id: 1, message: 'First update' },
      { id: 2, message: 'Second update' },
    ];

    const next = { id: 3, message: 'Third update' };

    expect(mergeSosMessages(existing, next)).toEqual([
      { id: 1, message: 'First update' },
      { id: 2, message: 'Second update' },
      { id: 3, message: 'Third update' },
    ]);

    expect(mergeSosMessages(existing, existing[1])).toEqual(existing);
  });
});
