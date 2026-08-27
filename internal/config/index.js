'use strict';

require('dotenv').config();

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? fallback : value;
}

function str(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

const config = {
  env: str('NODE_ENV', 'development'),
  port: int('PORT', 3000),
  logLevel: str('LOG_LEVEL', 'info'),

  postgres: {
    host: str('POSTGRES_HOST', 'localhost'),
    port: int('POSTGRES_PORT', 5432),
    database: str('POSTGRES_DB', 'labflow'),
    user: str('POSTGRES_USER', 'labflow'),
    password: str('POSTGRES_PASSWORD', 'labflow'),
    poolMax: int('POSTGRES_POOL_MAX', 10),
    idleTimeoutMillis: int('POSTGRES_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMillis: int('POSTGRES_CONNECTION_TIMEOUT_MS', 5000),
  },

  rabbitmq: {
    host: str('RABBITMQ_HOST', 'localhost'),
    port: int('RABBITMQ_PORT', 5672),
    user: str('RABBITMQ_USER', 'labflow'),
    password: str('RABBITMQ_PASSWORD', 'labflow'),
    vhost: str('RABBITMQ_VHOST', '/'),
    get url() {
      const vhost = encodeURIComponent(this.vhost === '/' ? '' : this.vhost);
      return `amqp://${this.user}:${this.password}@${this.host}:${this.port}/${vhost}`;
    },
  },

  redis: {
    host: str('REDIS_HOST', 'localhost'),
    port: int('REDIS_PORT', 6379),
    password: str('REDIS_PASSWORD', undefined),
  },

  auth: {
    jwtSecret: str('JWT_SECRET', 'change-me-in-production'),
    jwtExpiresIn: str('JWT_EXPIRES_IN', '8h'),
  },

  externalLab: {
    baseUrl: str('EXTERNAL_LAB_BASE_URL', 'http://localhost:4000'),
    port: int('EXTERNAL_LAB_PORT', 4000),
    webhookSecret: str('EXTERNAL_LAB_WEBHOOK_SECRET', 'change-me-shared-secret'),
    labflowWebhookUrl: str(
      'LABFLOW_WEBHOOK_URL',
      'http://localhost:3000/webhooks/laboratory/results',
    ),
  },

  reliability: {
    idempotencyKeyTtlSeconds: int('IDEMPOTENCY_KEY_TTL_SECONDS', 86400),
    outboxRelayIntervalMs: int('OUTBOX_RELAY_INTERVAL_MS', 1000),
    circuitBreakerTimeoutMs: int('CIRCUIT_BREAKER_TIMEOUT_MS', 5000),
    circuitBreakerErrorThreshold: int('CIRCUIT_BREAKER_ERROR_THRESHOLD', 50),
    circuitBreakerResetTimeoutMs: int('CIRCUIT_BREAKER_RESET_TIMEOUT_MS', 15000),
  },
};

module.exports = config;
