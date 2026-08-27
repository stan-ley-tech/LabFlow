'use strict';

const pino = require('pino');
const config = require('../config');
const { getContext } = require('./context');

const base = pino({
  level: config.logLevel,
  base: { service: 'labflow' },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const { correlationId, requestId } = getContext();
    const fields = {};
    if (correlationId) fields.correlationId = correlationId;
    if (requestId) fields.requestId = requestId;
    return fields;
  },
});

function child(bindings) {
  return base.child(bindings);
}

module.exports = base;
module.exports.child = child;
