'use strict';

const amqp = require('amqplib');
const config = require('../config');
const logger = require('../logger');
const { withRetry } = require('../lib/retry');

let connection = null;
let connectingPromise = null;
let reconnectTimer = null;
let closing = false;
const stateListeners = new Set();

function notifyState(state) {
  for (const listener of stateListeners) listener(state);
}

async function establishConnection() {
  const conn = await withRetry(() => amqp.connect(config.rabbitmq.url), {
    retries: 10,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    onRetry: ({ attempt, delayMs, err }) => {
      logger.warn({ attempt, delayMs, err: err.message }, 'rabbitmq connection retry');
    },
  });

  conn.on('error', (err) => {
    logger.error({ err }, 'rabbitmq connection error');
  });

  conn.on('close', () => {
    connection = null;
    notifyState('disconnected');
    // close() (an intentional shutdown) sets `closing` before tearing the
    // connection down, specifically so this handler doesn't schedule a
    // reconnect for a close *we* asked for — otherwise graceful shutdown
    // would spawn a timer that outlives the process it's supposed to end.
    if (closing) return;
    logger.warn('rabbitmq connection closed, scheduling reconnect');
    scheduleReconnect();
  });

  return conn;
}

function scheduleReconnect() {
  if (reconnectTimer || closing) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    getConnection().catch((err) => logger.error({ err }, 'rabbitmq reconnect failed'));
  }, 2000);
  reconnectTimer.unref();
}

/** Returns the shared amqp connection, connecting (or waiting for an in-flight connect) as needed. */
async function getConnection() {
  if (connection) return connection;
  if (connectingPromise) return connectingPromise;

  connectingPromise = establishConnection()
    .then((conn) => {
      connection = conn;
      connectingPromise = null;
      closing = false;
      notifyState('connected');
      return conn;
    })
    .catch((err) => {
      connectingPromise = null;
      throw err;
    });

  return connectingPromise;
}

function isConnected() {
  return connection !== null;
}

function onStateChange(listener) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

async function close() {
  closing = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (connection) {
    await connection.close().catch(() => {});
    connection = null;
  }
}

module.exports = { getConnection, isConnected, onStateChange, close };
