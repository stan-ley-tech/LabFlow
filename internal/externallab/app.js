'use strict';

const express = require('express');
const crypto = require('node:crypto');
const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
const { generateResultsForTest, generateExternalReferenceId } = require('./resultGenerator');

const FAILED_TEST_PROBABILITY = 0.05;

function signPayload(body, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

function buildResultsPayload(order, externalReferenceId) {
  const results = order.tests.map((test) => {
    if (Math.random() < FAILED_TEST_PROBABILITY) {
      return {
        labOrderItemId: test.labOrderItemId,
        testCode: test.code,
        status: 'failed',
        reason: 'specimen quality insufficient for analysis',
        values: [],
      };
    }
    return {
      labOrderItemId: test.labOrderItemId,
      testCode: test.code,
      status: 'completed',
      values: generateResultsForTest(test.code),
    };
  });

  return {
    webhookId: crypto.randomUUID(),
    laboratoryCode: order.laboratoryCode,
    laboratoryOrderId: externalReferenceId,
    labOrderId: order.labOrderId,
    results,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Delivers the results webhook back to LabFlow, retrying our own send a
 * couple of times on network failure — the same "the other side might be
 * briefly unavailable" problem LabFlow's adapter has when calling us,
 * mirrored here since a real lab's outbound webhook sender would do this.
 */
async function deliverWebhook(payload, { duplicate = false } = {}) {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, config.externalLab.webhookSecret);
  const headers = { 'content-type': 'application/json', 'x-labflow-signature': signature };

  const send = async () => {
    await axios.post(config.externalLab.labflowWebhookUrl, body, { headers, timeout: 5000 });
  };

  try {
    await send();
    logger.info({ webhookId: payload.webhookId }, 'fake lab delivered results webhook');
    if (duplicate) {
      await send();
      logger.info({ webhookId: payload.webhookId }, 'fake lab redelivered results webhook (simulated duplicate)');
    }
  } catch (err) {
    logger.error({ err: err.message, webhookId: payload.webhookId }, 'fake lab failed to deliver webhook');
  }
}

function createExternalLabApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/external/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/external/orders', (req, res) => {
    const order = req.body;
    if (!order || !order.labOrderId || !Array.isArray(order.tests) || order.tests.length === 0) {
      res.status(422).json({ error: 'invalid order payload' });
      return;
    }

    const simulate = req.header('x-simulate-failure');

    if (simulate === '500') {
      res.status(500).json({ error: 'simulated internal error' });
      return;
    }
    if (simulate === '422') {
      res.status(422).json({ error: 'simulated validation error' });
      return;
    }

    const externalReferenceId = generateExternalReferenceId();
    const acknowledgedAt = new Date().toISOString();

    if (simulate === 'timeout') {
      // Deliberately outlast the caller's own HTTP timeout so it experiences
      // a real timeout rather than a fast error.
      setTimeout(() => {
        res.json({ externalReferenceId, acknowledgedAt });
      }, 6000);
      return;
    }

    res.status(202).json({ externalReferenceId, acknowledgedAt });

    const turnaroundMs = 1000 + Math.random() * 2000;
    setTimeout(() => {
      const payload = buildResultsPayload(order, externalReferenceId);
      deliverWebhook(payload, { duplicate: simulate === 'duplicate-webhook' }).catch((err) => {
        logger.error({ err: err.message }, 'unhandled error delivering fake lab webhook');
      });
    }, turnaroundMs);
  });

  return app;
}

module.exports = createExternalLabApp;
