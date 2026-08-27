'use strict';

const crypto = require('node:crypto');

// A handful of common panels so simulated results look plausible. Reference
// ranges are illustrative, not clinical advice — this is a fake lab.
const TEST_PROFILES = {
  CBC: [
    { analyteName: 'White Blood Cell Count', unit: '10^3/uL', low: 4.5, high: 11.0, criticalLow: 2.0, criticalHigh: 30.0 },
    { analyteName: 'Hemoglobin', unit: 'g/dL', low: 12.0, high: 17.5, criticalLow: 6.5, criticalHigh: 20.0 },
    { analyteName: 'Platelet Count', unit: '10^3/uL', low: 150, high: 450, criticalLow: 20, criticalHigh: 1000 },
  ],
  BMP: [
    { analyteName: 'Sodium', unit: 'mmol/L', low: 135, high: 145, criticalLow: 120, criticalHigh: 160 },
    { analyteName: 'Potassium', unit: 'mmol/L', low: 3.5, high: 5.1, criticalLow: 2.5, criticalHigh: 6.5 },
    { analyteName: 'Creatinine', unit: 'mg/dL', low: 0.6, high: 1.3, criticalLow: 0.2, criticalHigh: 4.0 },
  ],
  GLU: [{ analyteName: 'Glucose', unit: 'mg/dL', low: 70, high: 100, criticalLow: 40, criticalHigh: 400 }],
  LIPID: [
    { analyteName: 'Total Cholesterol', unit: 'mg/dL', low: 100, high: 200, criticalLow: 50, criticalHigh: 500 },
    { analyteName: 'LDL', unit: 'mg/dL', low: 40, high: 130, criticalLow: 10, criticalHigh: 400 },
    { analyteName: 'HDL', unit: 'mg/dL', low: 40, high: 100, criticalLow: 10, criticalHigh: 150 },
  ],
  TSH: [
    { analyteName: 'Thyroid Stimulating Hormone', unit: 'mIU/L', low: 0.4, high: 4.0, criticalLow: 0.01, criticalHigh: 100 },
  ],
};

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Picks a value for one analyte: mostly within normal range, sometimes
 * abnormal, occasionally critical. `forceCritical` is used by test
 * scenarios (and the /external/orders `simulate` override) that need a
 * deterministic critical result rather than a random one.
 */
function generateValue(profile, forceCritical) {
  const roll = forceCritical ? 'critical' : weightedOutcome();

  let value;
  let isAbnormal = false;
  let isCritical = false;

  if (roll === 'critical') {
    const low = profile.criticalLow;
    const high = profile.criticalHigh;
    value = Math.random() < 0.5 ? randomBetween(low * 0.6, low) : randomBetween(high, high * 1.4);
    isAbnormal = true;
    isCritical = true;
  } else if (roll === 'abnormal') {
    value =
      Math.random() < 0.5
        ? randomBetween(profile.criticalLow, profile.low)
        : randomBetween(profile.high, profile.criticalHigh);
    isAbnormal = true;
  } else {
    value = randomBetween(profile.low, profile.high);
  }

  return {
    analyteName: profile.analyteName,
    value: String(round(value, 2)),
    unit: profile.unit,
    referenceRangeLow: profile.low,
    referenceRangeHigh: profile.high,
    isAbnormal,
    isCritical,
  };
}

function weightedOutcome() {
  const r = Math.random();
  if (r < 0.05) return 'critical';
  if (r < 0.2) return 'abnormal';
  return 'normal';
}

function generateResultsForTest(testCode, { forceCritical = false } = {}) {
  const profiles = TEST_PROFILES[testCode];

  if (!profiles) {
    const isCritical = Boolean(forceCritical);
    return [
      {
        analyteName: 'Result',
        value: isCritical ? 'Critical' : Math.random() < 0.85 ? 'Normal' : 'Abnormal',
        unit: null,
        referenceRangeLow: null,
        referenceRangeHigh: null,
        isAbnormal: isCritical,
        isCritical,
      },
    ];
  }

  return profiles.map((profile, index) => generateValue(profile, forceCritical && index === 0));
}

function generateExternalReferenceId() {
  return `EXT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

module.exports = { generateResultsForTest, generateExternalReferenceId, TEST_PROFILES };
