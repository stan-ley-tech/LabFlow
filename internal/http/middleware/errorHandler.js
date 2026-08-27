'use strict';

const logger = require('../../logger');
const { AppError } = require('../../lib/errors');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err }, 'request failed');
    }
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logger.error({ err }, 'unhandled request error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'internal server error' } });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'route not found' } });
}

module.exports = { errorHandler, notFoundHandler };
