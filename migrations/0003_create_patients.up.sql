CREATE TYPE patient_sex AS ENUM ('male', 'female', 'other', 'unknown');

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mrn TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  sex patient_sex NOT NULL DEFAULT 'unknown',
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patients_mrn_unique UNIQUE (mrn)
);

CREATE INDEX patients_last_name_idx ON patients (last_name);
