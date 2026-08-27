CREATE TYPE specimen_type AS ENUM ('blood', 'urine', 'swab', 'tissue', 'saliva', 'other');

CREATE TABLE lab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  specimen_type specimen_type NOT NULL,
  turnaround_hours INTEGER NOT NULL DEFAULT 24,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lab_tests_code_unique UNIQUE (code),
  CONSTRAINT lab_tests_turnaround_positive CHECK (turnaround_hours > 0)
);
