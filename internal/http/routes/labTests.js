'use strict';

const { Router } = require('express');
const { z } = require('zod');
const service = require('../../domain/labTests/service');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { paginationSchema } = require('../schemas/pagination');

const router = Router();

const SPECIMEN_TYPES = ['blood', 'urine', 'swab', 'tissue', 'saliva', 'other'];

const createLabTestSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  specimenType: z.enum(SPECIMEN_TYPES),
  turnaroundHours: z.number().int().positive().default(24),
});

router.use(authenticate);

router.post(
  '/',
  requireRole('admin', 'lab_technician'),
  validate(createLabTestSchema),
  asyncHandler(async (req, res) => {
    const test = await service.createLabTest(req.body, { type: 'user', id: req.user.id });
    res.status(201).json(test);
  }),
);

router.get(
  '/',
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    const tests = await service.listLabTests(req.query);
    res.json({ data: tests });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const test = await service.getLabTest(req.params.id);
    res.json(test);
  }),
);

module.exports = router;
