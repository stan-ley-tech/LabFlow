CREATE TYPE lab_order_item_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');

CREATE TABLE lab_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id UUID NOT NULL REFERENCES lab_orders (id) ON DELETE CASCADE,
  lab_test_id UUID NOT NULL REFERENCES lab_tests (id) ON DELETE RESTRICT,
  status lab_order_item_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lab_order_items_unique_test UNIQUE (lab_order_id, lab_test_id)
);

CREATE INDEX lab_order_items_lab_order_id_idx ON lab_order_items (lab_order_id);
CREATE INDEX lab_order_items_lab_test_id_idx ON lab_order_items (lab_test_id);
