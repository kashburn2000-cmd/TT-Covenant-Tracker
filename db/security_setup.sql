-- ════════════════════════════════════════════════════════════════════════
-- TT Covenant Tracker — security lockdown (one-time setup)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.
--
-- What this does
--   The publishable (anon) key ships inside the site's JavaScript bundle, so
--   anyone who finds the site can extract it. Before this script, that key
--   had full read/write access to every table. This script enables row-level
--   security on every app table and grants access ONLY to signed-in
--   (authenticated) users — the anon key alone gets no rows and no writes.
--
-- Companion changes required outside SQL (see README → Access Control):
--   1. Supabase Dashboard → Authentication → Sign In / Up →
--      turn OFF "Allow new users to sign up" (invite-only access).
--   2. Authentication → URL Configuration → set Site URL to the Vercel
--      domain so invite / password-reset emails link back to the app.
--   3. Invite users: Authentication → Users → "Invite user".
--   4. GitHub repo → Settings → Secrets → set SUPABASE_KEY to the project's
--      SECRET (service_role) key so the daily rate-pull Action can still
--      write to rate_history / curve_snapshots (service_role bypasses RLS).
-- ════════════════════════════════════════════════════════════════════════

-- Enable RLS on every app table and replace any permissive policies with a
-- single authenticated-only policy. Tables that don't exist yet are skipped,
-- so this runs cleanly on projects that haven't set up every feature.
do $$
declare
  t text;
begin
  foreach t in array array[
    'properties',
    'property_events',
    'settings',
    'sofr_curve',
    'ten_year_curve',
    'curve_snapshots',
    'rate_history',
    'debt_projects',
    'dashboard_layouts',
    'pipeline_deals',
    'land_draws',
    'leasing_snapshot',
    'loans',
    'project_locations',
    'tasks'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      -- Remove the old wide-open policy from loans_setup.sql (loans only,
      -- but dropping a non-existent policy name elsewhere is a no-op).
      execute format('drop policy if exists "loans anon all" on public.%I', t);
      execute format('drop policy if exists "%s authenticated all" on public.%I', t, t);
      execute format(
        'create policy "%s authenticated all" on public.%I for all to authenticated using (true) with check (true)',
        t, t
      );
    end if;
  end loop;
end $$;

-- ── Storage: loan-docs bucket — signed-in users only ──────────────────────
-- Replaces the anon-inclusive policies from loans_setup.sql.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'loan-docs') then
    drop policy if exists "loan-docs read"   on storage.objects;
    drop policy if exists "loan-docs insert" on storage.objects;
    drop policy if exists "loan-docs update" on storage.objects;
    drop policy if exists "loan-docs delete" on storage.objects;
    create policy "loan-docs read"   on storage.objects for select to authenticated using (bucket_id = 'loan-docs');
    create policy "loan-docs insert" on storage.objects for insert to authenticated with check (bucket_id = 'loan-docs');
    create policy "loan-docs update" on storage.objects for update to authenticated using (bucket_id = 'loan-docs');
    create policy "loan-docs delete" on storage.objects for delete to authenticated using (bucket_id = 'loan-docs');
  end if;
end $$;
