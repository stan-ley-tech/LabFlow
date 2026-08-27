-- Durable, queryable record of messages that exhausted their retries and
-- landed in a RabbitMQ dead-letter queue. The DLQ itself is the source of
-- truth for redelivery; this table is what lets a human find and triage
-- failures without a RabbitMQ management console.
CREATE TABLE dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  routing_key TEXT,
  payload JSONB,
  headers JSONB,
  error_message TEXT,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dead_letters_queue_name_idx ON dead_letters (queue_name);
CREATE INDEX dead_letters_resolved_idx ON dead_letters (resolved);
