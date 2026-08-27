'use strict';

const { Router } = require('express');
const { z } = require('zod');
const service = require('../../domain/patients/service');
const labResultsService = require('../../domain/labResults/service');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { paginationSchema } = require('../schemas/pagination');

const router = Router();

const createPatientSchema = z.object({
  mrn: z.string().min(1).max(64),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  sex: z.enum(['male', 'female', 'other', 'unknown']).default('unknown'),
  phone: z.string().max(32).optional(),
  email: z.string().email().optional(),
  address: z.string().max(255).optional(),
});

router.use(authenticate);

router.post(
  '/',
  requireRole('admin', 'clinician', 'specimen_collector'),
  validate(createPatientSchema),
  asyncHandler(async (req, res) => {
    const patient = await service.createPatient(req.body, { type: 'user', id: req.user.id });
    res.status(201).json(patient);
  }),
);

router.get(
  '/',
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    const patients = await service.listPatients(req.query);
    res.json({ data: patients });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const patient = await service.getPatient(req.params.id);
    res.json(patient);
  }),
);

router.get(
  '/:id/lab-results',
  asyncHandler(async (req, res) => {
    await service.getPatient(req.params.id);
    const results = await labResultsService.getPatientResults(req.params.id);
    res.json({ data: results });
  }),
);

module.exports = router;
