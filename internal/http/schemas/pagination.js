'use strict';

const { z } = require('zod');

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

module.exports = { paginationSchema };
