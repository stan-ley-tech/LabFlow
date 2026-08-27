'use strict';

const db = require('../../db/pool');

const COLUMNS =
  'id, lab_result_id, analyte_name, value, unit, reference_range_low, reference_range_high, is_abnormal, is_critical, created_at';

async function createMany(labResultId, values, executor) {
  const rows = [];
  for (const value of values) {
    // eslint-disable-next-line no-await-in-loop
    const { rows: inserted } = await executor(
      `INSERT INTO result_values
         (lab_result_id, analyte_name, value, unit, reference_range_low, reference_range_high, is_abnormal, is_critical)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        labResultId,
        value.analyteName,
        value.value,
        value.unit || null,
        value.referenceRangeLow ?? null,
        value.referenceRangeHigh ?? null,
        value.isAbnormal || false,
        value.isCritical || false,
      ],
    );
    rows.push(inserted[0]);
  }
  return rows;
}

async function listByResultId(labResultId, executor = db.query) {
  const { rows } = await executor(
    `SELECT ${COLUMNS} FROM result_values WHERE lab_result_id = $1 ORDER BY created_at`,
    [labResultId],
  );
  return rows;
}

module.exports = { createMany, listByResultId };
