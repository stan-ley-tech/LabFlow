'use strict';

const crypto = require('node:crypto');

function pad(n, width) {
  return String(n).padStart(width, '0');
}

/** Human-readable order number, e.g. ORD-20260826-4F2A1C. Not used for lookups. */
function generateOrderNumber(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1, 2);
  const d = pad(date.getUTCDate(), 2);
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${y}${m}${d}-${suffix}`;
}

/** Specimen barcode, e.g. SPC-9F3C7A1B2E4D. */
function generateSpecimenBarcode() {
  const suffix = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `SPC-${suffix}`;
}

module.exports = { generateOrderNumber, generateSpecimenBarcode };
