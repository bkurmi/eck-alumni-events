-- ============================================================
-- Migration v15: Event & Platform Experience Feedback
-- File: supabase/v15_event_feedback.sql
--
-- Stores attendee & alumni feedback for events (e.g. DeepAura 2K26)
-- and digital platform experience with flexible JSONB responses,
-- ratings, sentiment tags, and suggestions.
-- ============================================================

-- 1. Add optional feedback_config column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS feedback_config JSONB DEFAULT NULL;

-- 2. Create event_feedback table
CREATE TABLE IF NOT EXISTS event_feedback (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id     UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
  registration_number TEXT,
  
  -- Attendee metadata (optional, can be anonymous)
  attendee_name       TEXT,
  batch               TEXT,
  is_anonymous        BOOLEAN NOT NULL DEFAULT false,

  -- Core high-level metrics for fast indexing & rollups
  event_rating        INT CHECK (event_rating BETWEEN 1 AND 5),
  portal_rating       INT CHECK (portal_rating BETWEEN 1 AND 5),

  -- All detailed section responses stored as flexible JSONB
  -- Supports multiple-choice chips, radio selections, text notes
  responses           JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  user_agent          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS event_feedback_updated_at ON event_feedback;
CREATE TRIGGER event_feedback_updated_at
  BEFORE UPDATE ON event_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_feedback_event_id ON event_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_created_at ON event_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_feedback_event_rating ON event_feedback(event_rating);
CREATE INDEX IF NOT EXISTS idx_event_feedback_portal_rating ON event_feedback(portal_rating);

-- RLS Policies
ALTER TABLE event_feedback ENABLE ROW LEVEL SECURITY;

-- Allow public / alumni to insert feedback
DROP POLICY IF EXISTS "Public can submit event feedback" ON event_feedback;
CREATE POLICY "Public can submit event feedback"
  ON event_feedback
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Allow anyone to read aggregate or authenticated staff to view all
DROP POLICY IF EXISTS "Anyone can view feedback" ON event_feedback;
CREATE POLICY "Anyone can view feedback"
  ON event_feedback
  FOR SELECT
  TO public
  USING (true);

-- Allow authenticated users to manage feedback (delete/update if needed)
DROP POLICY IF EXISTS "Authenticated can manage feedback" ON event_feedback;
CREATE POLICY "Authenticated can manage feedback"
  ON event_feedback
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

