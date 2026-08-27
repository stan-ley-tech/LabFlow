CREATE TABLE clinicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  department TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinicians_license_number_unique UNIQUE (license_number),
  CONSTRAINT clinicians_email_unique UNIQUE (email)
);

-- Clinician-role users optionally link back to their clinician record.
ALTER TABLE users ADD COLUMN clinician_id UUID REFERENCES clinicians (id) ON DELETE SET NULL;
CREATE INDEX users_clinician_id_idx ON users (clinician_id);
