'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

function run(context, fn) {
  return storage.run(context, fn);
}

function getContext() {
  return storage.getStore() || {};
}

function getCorrelationId() {
  return getContext().correlationId;
}

module.exports = { run, getContext, getCorrelationId };
