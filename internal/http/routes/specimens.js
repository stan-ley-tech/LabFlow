'use strict';

const { Router } = require('express');
const service = require('../../domain/specimens/service');
const asyncHandler = require('../middleware/asyncHandler');
const authenticate = require('../middleware/auth');

const router = Router();

router.use(authenticate);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const specimen = await service.getSpecimen(req.params.id);
    res.json(specimen);
  }),
);

module.exports = router;
