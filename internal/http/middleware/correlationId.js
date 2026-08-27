'use strict';

const { v4: uuidv4 } = require('uuid');
const context = require('../../logger/context');

const HEADER = 'x-correlation-id';

/**
 * Every request gets a correlation id (reused across services if the caller
 * sent one) and a request id (always fresh, identifies this hop). Both are
 * stashed in AsyncLocalStorage so the logger and outbound event publisher
 * can pick them up without threading them through every function call.
 */
function correlationId(req, res, next) {
  const incoming = req.header(HEADER);
  const id = incoming && incoming.trim().length > 0 ? incoming.trim() : uuidv4();
  const requestId = uuidv4();

  req.correlationId = id;
  req.requestId = requestId;
  res.setHeader('X-Correlation-Id', id);

  context.run({ correlationId: id, requestId }, () => next());
}

module.exports = correlationId;
