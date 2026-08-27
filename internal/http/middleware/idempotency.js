'use strict';

const crypto = require('node:crypto');
const repository = require('../../domain/idempotencyKeys/repository');
const redis = require('../../redis/client');
const config = require('../../config');
const logger = require('../../logger');
const { ConflictError } = require('../../lib/errors');

const LOCK_TTL_SECONDS = 30;

function hashBody(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
}

/**
 * Applies to routes that create something non-idempotent by nature (POST
 * /lab-orders, in practice). A client that didn't get a response — timeout,
 * dropped connection — can safely retry with the same Idempotency-Key
 * header and get the original result instead of a second order.
 *
 * Two layers: a short-lived Redis lock (SET NX) arbitrates concurrent
 * requests carrying the same key while one is still being handled; the
 * idempotency_keys table is the durable record of the outcome, checked
 * first so a request replayed hours later still gets the original response
 * without needing the lock. Must run after body validation, since the
 * response is cached keyed on the validated (not raw) request body.
 */
async function idempotency(req, res, next) {
  const key = req.header('idempotency-key');
  if (!key) {
    next();
    return;
  }

  const route = `${req.method}:${req.baseUrl}${req.path}`;
  const requestHash = hashBody(req.body);

  try {
    let record = await repository.findByKeyAndRoute(key, route);

    if (record) {
      if (record.request_hash !== requestHash) {
        next(new ConflictError('idempotency key was already used with a different request body'));
        return;
      }
      if (record.status === 'completed') {
        res.status(record.response_status).json(record.response_body);
        return;
      }
    }

    const lockKey = `idempotency:lock:${route}:${key}`;
    const acquired = await redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    if (!acquired) {
      next(new ConflictError('a request with this idempotency key is already in progress'));
      return;
    }

    if (!record) {
      record = await repository.claim({
        idempotencyKey: key,
        route,
        requestHash,
        expiresAt: new Date(Date.now() + config.reliability.idempotencyKeyTtlSeconds * 1000),
      });
      if (!record) {
        await redis.del(lockKey).catch(() => {});
        next(new ConflictError('a request with this idempotency key is already in progress'));
        return;
      }
    }

    const recordId = record.id;
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      const responseStatus = res.statusCode;
      const persist =
        responseStatus >= 500
          ? repository.remove(recordId)
          : repository.complete(recordId, { responseStatus, responseBody: body });

      persist
        .catch((err) => logger.error({ err }, 'failed to finalize idempotency key'))
        .finally(() => {
          redis.del(lockKey).catch(() => {});
        });

      return originalJson(body);
    };

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = idempotency;
