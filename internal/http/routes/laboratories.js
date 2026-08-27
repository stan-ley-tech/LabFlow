'use strict';

const { Router } = require('express');
const { z } = require('zod');
const service = require('../../domain/laboratories/service');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

const createLaboratorySchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  adapterType: z.string().min(1).max(64).default('fake_http'),
  baseUrl: z.string().url(),
  webhookSecret: z.string().min(8),
});

router.use(authenticate);

router.post(
  '/',
  requireRole('admin'),
  validate(createLaboratorySchema),
  asyncHandler(async (req, res) => {
    const lab = await service.createLaboratory(req.body, { type: 'user', id: req.user.id });
    res.status(201).json(lab);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const labs = await service.listLaboratories({ activeOnly: req.query.all !== 'true' });
    res.json({ data: labs });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const lab = await service.getLaboratory(req.params.id);
    res.json(lab);
  }),
);

module.exports = router;
