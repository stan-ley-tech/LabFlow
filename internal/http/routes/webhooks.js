'use strict';

const express = require('express');
const { z } = require('zod');
const laboratoriesRepository = require('../../domain/laboratories/repository');
const labResultsService = require('../../domain/labResults/service');
const { withTransaction } = require('../../db/transaction');
const asyncHandler = require('../middleware/asyncHandler');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../../lib/errors');
const { verify: verifySignature } = require('../../lib/webhookSignature');
const logger = require('../../logger');

const router = express.Router();

const resultValueSchema = z.object({
  analyteName: z.string().min(1),
  value: z.string().min(1),
  unit: z.string().nullable().optional(),
  referenceRangeLow: z.number().nullable().optional(),
  referenceRangeHigh: z.number().nullable().optional(),
  isAbnormal: z.boolean().default(false),
  isCritical: z.boolean().default(false),
});

const resultItemSchema = z.object({
  labOrderItemId: z.string().uuid(),
  testCode: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  reason: z.string().optional(),
  values: z.array(resultValueSchema).default([]),
});

const webhookPayloadSchema = z.object({
  webhookId: z.string().uuid(),
  laboratoryCode: z.string().min(1),
  laboratoryOrderId: z.string().min(1),
  labOrderId: z.string().uuid(),
  results: z.array(resultItemSchema).min(1),
  generatedAt: z.string(),
});

/**
 * Claims a webhook delivery for processing. The unique index on
 * (laboratory_id, external_reference_id) for request_type = 'result_webhook'
 * (migrations/0013) means a redelivery of the same webhookId hits
 * ON CONFLICT DO NOTHING and returns no row — that's how we recognize a
 * duplicate without a separate read-then-write race.
 */
async function claimDelivery(laboratory, payload, rawBody) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO integration_requests
         (laboratory_id, lab_order_id, request_type, external_reference_id, request_payload, status, attempt_count, last_attempt_at)
       VALUES ($1, $2, 'result_webhook', $3, $4::jsonb, 'acknowledged', 1, now())
       ON CONFLICT (laboratory_id, external_reference_id)
         WHERE request_type = 'result_webhook' AND external_reference_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [laboratory.id, payload.labOrderId, payload.webhookId, rawBody.toString('utf8')],
    );
    return rows[0] || null;
  });
}

router.post(
  '/laboratory/results',
  express.raw({ type: 'application/json', limit: '2mb' }),
  asyncHandler(async (req, res) => {
    const rawBody = req.body;

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody.toString('utf8'));
    } catch (_err) {
      throw new ValidationError('malformed JSON body');
    }

    let payload;
    try {
      payload = webhookPayloadSchema.parse(parsedBody);
    } catch (err) {
      throw new ValidationError('invalid webhook payload', err.issues);
    }

    const laboratory = await laboratoriesRepository.findByCode(payload.laboratoryCode);
    if (!laboratory) {
      throw new NotFoundError(`unknown laboratory code ${payload.laboratoryCode}`);
    }

    if (!verifySignature(rawBody, req.header('x-labflow-signature'), laboratory.webhook_secret)) {
      throw new UnauthorizedError('invalid webhook signature');
    }

    const claimed = await claimDelivery(laboratory, payload, rawBody);
    if (!claimed) {
      logger.info({ webhookId: payload.webhookId }, 'duplicate results webhook, already processed');
      res.status(200).json({ status: 'already_processed' });
      return;
    }

    for (const result of payload.results) {
      try {
        if (result.status === 'completed') {
          // eslint-disable-next-line no-await-in-loop
          await labResultsService.createResult({
            labOrderItemId: result.labOrderItemId,
            laboratoryId: laboratory.id,
            values: result.values,
          });
        } else {
          // eslint-disable-next-line no-await-in-loop
          await labResultsService.markResultFailed(
            result.labOrderItemId,
            result.reason || 'laboratory reported failure',
          );
        }
      } catch (err) {
        logger.error(
          { err, labOrderItemId: result.labOrderItemId, webhookId: payload.webhookId },
          'failed to apply one result item from webhook',
        );
      }
    }

    res.status(200).json({ status: 'processed' });
  }),
);

module.exports = router;
