'use strict';

const { sign, verify } = require('../../internal/lib/webhookSignature');

describe('webhook signature', () => {
  const secret = 'shared-secret';
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));

  test('a signature produced by sign() verifies against the same body and secret', () => {
    const signature = sign(body, secret);
    expect(verify(body, signature, secret)).toBe(true);
  });

  test('rejects a signature computed with the wrong secret', () => {
    const signature = sign(body, 'a-different-secret');
    expect(verify(body, signature, secret)).toBe(false);
  });

  test('rejects a signature for a body that was tampered with', () => {
    const signature = sign(body, secret);
    const tampered = Buffer.from(JSON.stringify({ hello: 'tampered' }));
    expect(verify(tampered, signature, secret)).toBe(false);
  });

  test('rejects a missing header', () => {
    expect(verify(body, undefined, secret)).toBe(false);
  });

  test('rejects a header without the sha256= prefix', () => {
    expect(verify(body, 'not-a-real-signature', secret)).toBe(false);
  });
});
