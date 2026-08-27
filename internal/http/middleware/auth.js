'use strict';

const jwt = require('jsonwebtoken');
const config = require('../../config');
const { UnauthorizedError } = require('../../lib/errors');

function authenticate(req, _res, next) {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    next(new UnauthorizedError('missing bearer token'));
    return;
  }

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (_err) {
    next(new UnauthorizedError('invalid or expired token'));
  }
}

module.exports = authenticate;
