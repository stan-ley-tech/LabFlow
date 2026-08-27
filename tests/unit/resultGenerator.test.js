'use strict';

const { generateResultsForTest, generateExternalReferenceId } = require('../../internal/externallab/resultGenerator');

describe('generateResultsForTest', () => {
  test('returns the known analytes for a recognized panel', () => {
    const values = generateResultsForTest('CBC');
    const names = values.map((v) => v.analyteName);
    expect(names).toEqual(['White Blood Cell Count', 'Hemoglobin', 'Platelet Count']);
  });

  test('every generated value carries its reference range and unit', () => {
    const values = generateResultsForTest('BMP');
    for (const value of values) {
      expect(typeof value.value).toBe('string');
      expect(value.referenceRangeLow).toEqual(expect.any(Number));
      expect(value.referenceRangeHigh).toEqual(expect.any(Number));
      expect(typeof value.isAbnormal).toBe('boolean');
      expect(typeof value.isCritical).toBe('boolean');
    }
  });

  test('forceCritical guarantees at least the first analyte is critical', () => {
    const values = generateResultsForTest('GLU', { forceCritical: true });
    expect(values[0].isCritical).toBe(true);
    expect(values[0].isAbnormal).toBe(true);
  });

  test('falls back to a generic qualitative result for an unknown test code', () => {
    const values = generateResultsForTest('NOT-A-REAL-CODE');
    expect(values).toHaveLength(1);
    expect(values[0].analyteName).toBe('Result');
    expect(values[0].unit).toBeNull();
  });

  test('unknown test code still honors forceCritical', () => {
    const values = generateResultsForTest('NOT-A-REAL-CODE', { forceCritical: true });
    expect(values[0].value).toBe('Critical');
    expect(values[0].isCritical).toBe(true);
  });
});

describe('generateExternalReferenceId', () => {
  test('matches the EXT-<hex> format and is unique across calls', () => {
    const a = generateExternalReferenceId();
    const b = generateExternalReferenceId();
    expect(a).toMatch(/^EXT-[0-9A-F]{16}$/);
    expect(a).not.toBe(b);
  });
});
