CREATE TYPE lab_result_status AS ENUM ('pending_validation', 'validated', 'rejected');

CREATE TABLE lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_item_id UUID NOT NULL REFERENCES lab_order_items (id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories (id) ON DELETE RESTRICT,
  status lab_result_status NOT NULL DEFAULT 'pending_validation',
  is_critical BOOLEAN NOT NULL DEFAULT false,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lab_results_order_item_unique UNIQUE (lab_order_item_id)
);

CREATE INDEX lab_results_laboratory_id_idx ON lab_results (laboratory_id);
CREATE INDEX lab_results_status_idx ON lab_results (status);
