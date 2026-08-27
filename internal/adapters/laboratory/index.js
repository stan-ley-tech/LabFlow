'use strict';

const FakeHttpLaboratoryAdapter = require('./FakeHttpLaboratoryAdapter');

const ADAPTERS = {
  fake_http: FakeHttpLaboratoryAdapter,
};

// Adapters wrap a circuit breaker and an HTTP client, so we keep one
// instance per laboratory rather than building a fresh one per call.
const instances = new Map();

function getAdapter(laboratory) {
  const cached = instances.get(laboratory.id);
  if (cached) return cached;

  const AdapterClass = ADAPTERS[laboratory.adapter_type];
  if (!AdapterClass) {
    throw new Error(`no adapter registered for laboratory adapter type '${laboratory.adapter_type}'`);
  }

  const adapter = new AdapterClass(laboratory);
  instances.set(laboratory.id, adapter);
  return adapter;
}

module.exports = { getAdapter, ADAPTERS };
