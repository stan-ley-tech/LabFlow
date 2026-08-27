'use strict';

const { Router } = require('express');
const { z } = require('zod');
const service = require('../../domain/users/service');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

const ROLES = ['admin', 'clinician', 'specimen_collector', 'lab_technician', 'lab_validator', 'system'];

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: z.enum(ROLES),
  clinicianId: z.string().uuid().optional(),
});

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { token, user } = await service.login(req.body);
    res.json({ token, user });
  }),
);

router.post(
  '/users',
  authenticate,
  requireRole('admin'),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const user = await service.registerUser(req.body);
    res.status(201).json(user);
  }),
);

module.exports = router;
