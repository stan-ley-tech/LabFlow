'use strict';

const { generateOrderNumber, generateSpecimenBarcode } = require('../../internal/lib/identifiers');

describe('generateOrderNumber', () => {
  test('embeds the given date and a unique suffix', () => {
    const date = new Date(Date.UTC(2026, 0, 5));
    const orderNumber = generateOrderNumber(date);
    expect(orderNumber).toMatch(/^ORD-20260105-[0-9A-F]{6}$/);
  });

  test('generates a different suffix on each call', () => {
    const a = generateOrderNumber();
    const b = generateOrderNumber();
    expect(a).not.toBe(b);
  });
});

describe('generateSpecimenBarcode', () => {
  test('matches the SPC-<hex> format', () => {
    expect(generateSpecimenBarcode()).toMatch(/^SPC-[0-9A-F]{12}$/);
  });

  test('is unique across calls', () => {
    const barcodes = new Set(Array.from({ length: 50 }, () => generateSpecimenBarcode()));
    expect(barcodes.size).toBe(50);
  });
});
