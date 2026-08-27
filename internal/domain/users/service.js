'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const repository = require('./repository');
const { ConflictError, UnauthorizedError } = require('../../lib/errors');

const SALT_ROUNDS = 12;

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    clinicianId: user.clinician_id,
    isActive: user.is_active,
    createdAt: user.created_at,
  };
}

async function registerUser({ email, password, fullName, role, clinicianId }) {
  const existing = await repository.findByEmail(email);
  if (existing) {
    throw new ConflictError('a user with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await repository.create({ email, passwordHash, fullName, role, clinicianId });
  return toPublicUser(user);
}

function issueToken(user) {
  return jwt.sign({ email: user.email, role: user.role }, config.auth.jwtSecret, {
    subject: user.id,
    expiresIn: config.auth.jwtExpiresIn,
  });
}

async function login({ email, password }) {
  const user = await repository.findByEmail(email);
  if (!user || !user.is_active) {
    throw new UnauthorizedError('invalid email or password');
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    throw new UnauthorizedError('invalid email or password');
  }

  return { token: issueToken(user), user: toPublicUser(user) };
}

module.exports = { registerUser, login, toPublicUser };
