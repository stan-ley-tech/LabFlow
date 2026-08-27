CREATE TYPE idempotency_status AS ENUM ('in_progress', 'completed');

CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  route TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status idempotency_status NOT NULL DEFAULT 'in_progress',
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT idempotency_keys_unique UNIQUE (idempotency_key, route)
);

CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);
