CREATE TABLE specimen_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specimen_id UUID NOT NULL REFERENCES specimens (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  notes TEXT,
  recorded_by UUID REFERENCES users (id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX specimen_events_specimen_id_idx ON specimen_events (specimen_id);
CREATE INDEX specimen_events_occurred_at_idx ON specimen_events (occurred_at);
