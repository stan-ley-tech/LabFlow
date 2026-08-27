'use strict';

const { Router } = require('express');
const { z } = require('zod');
const service = require('../../domain/labResults/service');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

const resultValueSchema = z.object({
  analyteName: z.string().min(1).max(120),
  value: z.string().min(1),
  unit: z.string().max(32).optional(),
  referenceRangeLow: z.number().optional(),
  referenceRangeHigh: z.number().optional(),
  isAbnormal: z.boolean().default(false),
  isCritical: z.boolean().default(false),
});

const createResultSchema = z.object({
  labOrderItemId: z.string().uuid(),
  laboratoryId: z.string().uuid(),
  values: z.array(resultValueSchema).min(1),
});

router.use(authenticate);

router.post(
  '/',
  requireRole('admin', 'lab_technician'),
  validate(createResultSchema),
  asyncHandler(async (req, res) => {
    const result = await service.createResult(req.body);
    res.status(201).json(result);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await service.getResult(req.params.id);
    res.json(result);
  }),
);

router.post(
  '/:id/validate',
  requireRole('admin', 'lab_validator'),
  asyncHandler(async (req, res) => {
    const result = await service.validateResult(req.params.id, { validatedByUserId: req.user.id });
    res.json(result);
  }),
);

module.exports = router;
