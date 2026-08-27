CREATE TABLE result_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_result_id UUID NOT NULL REFERENCES lab_results (id) ON DELETE CASCADE,
  analyte_name TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT,
  reference_range_low NUMERIC,
  reference_range_high NUMERIC,
  is_abnormal BOOLEAN NOT NULL DEFAULT false,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX result_values_lab_result_id_idx ON result_values (lab_result_id);
