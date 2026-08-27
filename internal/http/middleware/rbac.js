'use strict';

const { ForbiddenError } = require('../../lib/errors');

/** requireRole('admin', 'lab_validator') — any of the listed roles may proceed. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new ForbiddenError(`requires one of roles: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}

module.exports = requireRole;
