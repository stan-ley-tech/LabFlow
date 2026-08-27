'use strict';

const { ZodError } = require('zod');
const { ValidationError } = require('../../lib/errors');

/**
 * Validates req[part] against a zod schema and replaces it with the parsed
 * (and therefore type-coerced/defaulted) value. Schemas live next to the
 * routes that use them.
 */
function validate(schema, part = 'body') {
  return (req, _res, next) => {
    try {
      req[part] = schema.parse(req[part]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError('invalid request', err.issues));
        return;
      }
      next(err);
    }
  };
}

module.exports = validate;
