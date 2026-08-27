'use strict';

const { Router } = require('express');
const { z } = require('zod');
const service = require('../../domain/clinicians/service');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { paginationSchema } = require('../schemas/pagination');

const router = Router();

const createClinicianSchema = z.object({
  licenseNumber: z.string().min(1).max(64),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(32).optional(),
  department: z.string().max(120).optional(),
});

router.use(authenticate);

router.post(
  '/',
  requireRole('admin'),
  validate(createClinicianSchema),
  asyncHandler(async (req, res) => {
    const clinician = await service.createClinician(req.body, { type: 'user', id: req.user.id });
    res.status(201).json(clinician);
  }),
);

router.get(
  '/',
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    const clinicians = await service.listClinicians(req.query);
    res.json({ data: clinicians });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const clinician = await service.getClinician(req.params.id);
    res.json(clinician);
  }),
);

module.exports = router;
