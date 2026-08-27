'use strict';

const orderValidationWorker = require('./orderValidationWorker');
const specimenRequestWorker = require('./specimenRequestWorker');
const specimenDispatchWorker = require('./specimenDispatchWorker');
const labProcessingStartWorker = require('./labProcessingStartWorker');
const resultReceivedWorker = require('./resultReceivedWorker');
const resultNotifyValidatedWorker = require('./resultNotifyValidatedWorker');
const resultNotifyCriticalWorker = require('./resultNotifyCriticalWorker');
const failureRecoveryWorker = require('./failureRecoveryWorker');

// name -> routing key mapping lives in internal/events/topology.js; this is
// just consumer name -> handler function, shared by cmd/worker/index.js and
// the end-to-end tests so both boot the exact same set of consumers.
const CONSUMER_BINDINGS = [
  ['order-validation', orderValidationWorker.handleOrderCreated],
  ['specimen-request', specimenRequestWorker.handleOrderValidated],
  ['specimen-dispatch', specimenDispatchWorker.handleSpecimenCollected],
  ['lab-processing-start', labProcessingStartWorker.handleSpecimenReceived],
  ['result-received', resultReceivedWorker.handleResultCreated],
  ['result-notify-validated', resultNotifyValidatedWorker.handleResultValidated],
  ['result-notify-critical', resultNotifyCriticalWorker.handleResultCritical],
  ['failure-recovery', failureRecoveryWorker.handleResultFailed],
];

module.exports = { CONSUMER_BINDINGS };
