CREATE TYPE integration_request_type AS ENUM ('send_order', 'result_webhook');
CREATE TYPE integration_request_status AS ENUM ('pending', 'sent', 'acknowledged', 'failed', 'timeout');

CREATE TABLE integration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories (id) ON DELETE RESTRICT,
  lab_order_id UUID REFERENCES lab_orders (id) ON DELETE SET NULL,
  request_type integration_request_type NOT NULL,
  external_reference_id TEXT,
  status integration_request_status NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Webhook deliveries are deduped per laboratory + their external event id.
CREATE UNIQUE INDEX integration_requests_webhook_dedupe_idx
  ON integration_requests (laboratory_id, external_reference_id)
  WHERE request_type = 'result_webhook' AND external_reference_id IS NOT NULL;

CREATE INDEX integration_requests_lab_order_id_idx ON integration_requests (lab_order_id);
CREATE INDEX integration_requests_status_idx ON integration_requests (status);
