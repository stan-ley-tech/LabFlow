CREATE TYPE lab_order_status AS ENUM (
  'pending',
  'validated',
  'specimen_requested',
  'specimen_collected',
  'in_progress',
  'results_received',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE lab_order_priority AS ENUM ('routine', 'urgent', 'stat');

CREATE TABLE lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients (id) ON DELETE RESTRICT,
  clinician_id UUID NOT NULL REFERENCES clinicians (id) ON DELETE RESTRICT,
  status lab_order_status NOT NULL DEFAULT 'pending',
  priority lab_order_priority NOT NULL DEFAULT 'routine',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lab_orders_order_number_unique UNIQUE (order_number)
);

CREATE INDEX lab_orders_patient_id_idx ON lab_orders (patient_id);
CREATE INDEX lab_orders_clinician_id_idx ON lab_orders (clinician_id);
CREATE INDEX lab_orders_status_idx ON lab_orders (status);
CREATE INDEX lab_orders_created_at_idx ON lab_orders (created_at);
