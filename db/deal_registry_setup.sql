-- ════════════════════════════════════════════════════════════════════════
-- TT Covenant Tracker — Deal Registry setup (one-time)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.
--
-- Creates deal_registry: one row per real-world deal with a stable
-- human-readable id (TT-001, TT-002, …) that persists across schedule
-- re-uploads, renames, and tabs. debt_projects, pipeline_deals, and
-- project_locations each gain a deal_uid column pointing at the registry,
-- so once a row is linked nothing depends on name matching again.
--
-- Status lifecycle: pipeline → committed → construction → stabilized → sold.
-- A NULL status means "derive from where the deal appears" (schedule source
-- + is_committed flag, exactly like before this table existed). A set
-- status is a manual override made on the hidden Deal Registry tab and
-- always wins over uploaded data until cleared.
--
-- Classification (orthogonal to status): NULL = ordinary project.
-- 'land_facility' marks a credit facility — the Simmons land guidance line —
-- that rides in on the At Risk schedule but isn't a project: it stays off
-- the Project Map and is broken out separately from projects on the Debt
-- Dashboard. Set manually on the hidden Deal Registry tab.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS deal_registry (
  uid text PRIMARY KEY,            -- 'TT-001' — assigned sequentially on first appearance
  name text NOT NULL,              -- canonical display name
  status text CHECK (status IN ('pipeline', 'committed', 'construction', 'stabilized', 'sold')),
  classification text CHECK (classification IN ('land_facility')), -- NULL = ordinary project
  notes text,
  reviewed boolean NOT NULL DEFAULT false, -- false = auto-created and not yet looked at ("NEW" flag on the registry tab)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Installs that created deal_registry before classification existed.
ALTER TABLE deal_registry ADD COLUMN IF NOT EXISTS classification text
  CHECK (classification IN ('land_facility'));

-- Link columns on the tables that hold deal rows. Nullable: rows are linked
-- lazily (on upload / when the registry tab syncs), never required up front.
ALTER TABLE debt_projects     ADD COLUMN IF NOT EXISTS deal_uid text;
ALTER TABLE pipeline_deals    ADD COLUMN IF NOT EXISTS deal_uid text;
ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS deal_uid text;

-- Loan abstracts link too, but by hand rather than by name: the abstract's
-- names ("Sarasota", "TTRES CO Wheat Ridge Kipling St, LLC") never equal the
-- schedule's ("TTRes at Sarasota, FL"), so the Import Abstract dialog asks
-- which deal the abstract belongs to and stamps it here. Unlike the tables
-- above, loans are never auto-linked by the registry sync.
DO $$
BEGIN
  IF to_regclass('public.loans') IS NOT NULL THEN
    ALTER TABLE loans ADD COLUMN IF NOT EXISTS deal_uid text;
    CREATE INDEX IF NOT EXISTS loans_deal_uid_idx ON loans (deal_uid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS debt_projects_deal_uid_idx  ON debt_projects (deal_uid);
CREATE INDEX IF NOT EXISTS pipeline_deals_deal_uid_idx ON pipeline_deals (deal_uid);

-- One pin per deal. NULLs stay allowed so legacy name_key-only pins keep
-- working until the registry sync stamps them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_locations_deal_uid_key'
  ) THEN
    ALTER TABLE project_locations ADD CONSTRAINT project_locations_deal_uid_key UNIQUE (deal_uid);
  END IF;
END $$;

-- Row-level security — signed-in users only, matching db/security_setup.sql.
ALTER TABLE deal_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deal_registry authenticated all" ON deal_registry;
CREATE POLICY "deal_registry authenticated all" ON deal_registry
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
