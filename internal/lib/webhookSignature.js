'use strict';

const crypto = require('node:crypto');

const PREFIX = 'sha256=';

/** Signs a raw request body for the X-Labflow-Signature header. */
function sign(body, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return `${PREFIX}${hmac.digest('hex')}`;
}

/**
 * Verifies a signature header against the raw body using a constant-time
 * comparison, so a mismatch can't be used to brute-force the secret one
 * byte at a time via response-timing.
 */
function verify(rawBody, header, secret) {
  if (!header || !header.startsWith(PREFIX)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(header.slice(PREFIX.length), 'hex');

  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { sign, verify };
