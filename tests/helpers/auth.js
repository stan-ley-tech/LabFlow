'use strict';

const jwt = require('jsonwebtoken');
const config = require('../../internal/config');

function issueTestToken(user) {
  return jwt.sign({ email: user.email, role: user.role }, config.auth.jwtSecret, {
    subject: user.id,
    expiresIn: '1h',
  });
}

module.exports = { issueTestToken };
