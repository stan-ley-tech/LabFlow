CREATE TYPE outbox_event_status AS ENUM ('pending', 'published', 'failed');

-- Transactional outbox: domain writes and the event they trigger are committed
-- together here, in the same transaction. A separate relay process (see
-- internal/events/outboxRelay.js) polls for 'pending' rows and publishes them
-- to RabbitMQ, which is the only way to get exactly-once-write/at-least-once-publish
-- semantics without a distributed transaction across Postgres and RabbitMQ.
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status outbox_event_status NOT NULL DEFAULT 'pending',
  correlation_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX outbox_events_status_idx ON outbox_events (status, created_at);
