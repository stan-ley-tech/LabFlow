CREATE TYPE specimen_status AS ENUM (
  'requested',
  'collected',
  'in_transit',
  'received',
  'rejected',
  'disposed'
);

CREATE TABLE specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id UUID NOT NULL REFERENCES lab_orders (id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  specimen_type specimen_type NOT NULL,
  status specimen_status NOT NULL DEFAULT 'requested',
  collected_by UUID REFERENCES users (id) ON DELETE SET NULL,
  collected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT specimens_barcode_unique UNIQUE (barcode)
);

CREATE INDEX specimens_lab_order_id_idx ON specimens (lab_order_id);
CREATE INDEX specimens_status_idx ON specimens (status);
