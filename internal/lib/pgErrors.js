'use strict';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

function isUniqueViolation(err, constraint) {
  return err && err.code === UNIQUE_VIOLATION && (!constraint || err.constraint === constraint);
}

function isForeignKeyViolation(err) {
  return err && err.code === FOREIGN_KEY_VIOLATION;
}

function isCheckViolation(err) {
  return err && err.code === CHECK_VIOLATION;
}

module.exports = { isUniqueViolation, isForeignKeyViolation, isCheckViolation };
