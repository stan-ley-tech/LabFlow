'use strict';

const { Router } = require('express');
const { z } = require('zod');
const service = require('../../domain/labOrders/service');
const specimenService = require('../../domain/specimens/service');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const { paginationSchema } = require('../schemas/pagination');

const router = Router();

const createOrderSchema = z.object({
  patientId: z.string().uuid(),
  clinicianId: z.string().uuid(),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
  notes: z.string().max(2000).optional(),
  labTestIds: z.array(z.string().uuid()).min(1),
});

const collectSchema = z.object({
  notes: z.string().max(2000).optional(),
});

const listOrdersQuerySchema = paginationSchema.extend({
  patientId: z.string().uuid().optional(),
  status: z
    .enum([
      'pending',
      'validated',
      'specimen_requested',
      'specimen_collected',
      'in_progress',
      'results_received',
      'completed',
      'failed',
      'cancelled',
    ])
    .optional(),
});

router.use(authenticate);

router.post(
  '/',
  requireRole('admin', 'clinician'),
  validate(createOrderSchema),
  asyncHandler(async (req, res) => {
    const order = await service.createOrder(req.body, { type: 'user', id: req.user.id });
    res.status(201).json(order);
  }),
);

router.get(
  '/',
  validate(listOrdersQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const orders = await service.listOrders(req.query);
    res.json({ data: orders });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await service.getOrder(req.params.id);
    res.json(order);
  }),
);

router.post(
  '/:id/collect',
  requireRole('admin', 'specimen_collector'),
  validate(collectSchema),
  asyncHandler(async (req, res) => {
    const specimen = await specimenService.collectSpecimen(req.params.id, {
      collectedByUserId: req.user.id,
      notes: req.body.notes,
    });
    res.status(200).json(specimen);
  }),
);

module.exports = router;
