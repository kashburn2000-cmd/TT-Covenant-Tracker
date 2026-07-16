-- ════════════════════════════════════════════════════════════════════════
-- TT Covenant Tracker — Project Map setup (one-time)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.
--
-- Creates project_locations: one manually-placed map pin per project,
-- keyed by the same normalized name_key used by debt_projects, so pins
-- survive schedule re-uploads (the schedules carry no coordinates).
-- Pipeline deals pin by the same normalization of their deal name.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_locations (
  id bigserial PRIMARY KEY,
  name_key text NOT NULL UNIQUE,   -- normalized project name (lowercase, alphanumeric only)
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Row-level security — signed-in users only, matching db/security_setup.sql.
ALTER TABLE project_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_locations authenticated all" ON project_locations;
CREATE POLICY "project_locations authenticated all" ON project_locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
