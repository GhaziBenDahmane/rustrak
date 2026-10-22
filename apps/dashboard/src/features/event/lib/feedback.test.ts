import { describe, expect, it } from 'vitest';
import { readFeedback } from './feedback';

describe('readFeedback', () => {
  it('is null for an event that is not a feedback', () => {
    expect(
      readFeedback({ contexts: { feedback: { message: 'hi' } } }),
    ).toBeNull();
    expect(readFeedback({ type: 'error' })).toBeNull();
  });

  it('reads what the user submitted', () => {
    expect(
      readFeedback({
        type: 'feedback',
        contexts: {
          feedback: {
            message: 'The button does nothing',
            name: 'Jane',
            contact_email: 'jane@example.com',
            url: 'https://shop.example/checkout',
            associated_event_id: 'abc123',
          },
        },
      }),
    ).toEqual({
      message: 'The button does nothing',
      name: 'Jane',
      contactEmail: 'jane@example.com',
      url: 'https://shop.example/checkout',
      associatedEventId: 'abc123',
    });
  });

  it('falls back to the request url and blanks what is missing', () => {
    expect(
      readFeedback({
        type: 'feedback',
        request: { url: 'https://shop.example/' },
        contexts: { feedback: { message: 'hi', name: null } },
      }),
    ).toEqual({
      message: 'hi',
      name: '',
      contactEmail: '',
      url: 'https://shop.example/',
      associatedEventId: null,
    });
  });
});
