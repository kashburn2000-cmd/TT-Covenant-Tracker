-- ════════════════════════════════════════════════════════════════════════
-- TT Loans — Per-deal Document Repository (one-time setup)
-- Run this in the Supabase SQL editor. Safe to re-run: idempotent.
--
-- What this creates
--   public.deal_documents — every financing document attached to a loan
--   record (loan agreement, guaranty, amendments, closing docs, insurance,
--   correspondence, …), not just the single abstract .docx.
--
-- Storage
--   Files live in the existing private "loan-docs" bucket under
--   docs/<loan_id>/<timestamp>-<filename>. The timestamped path means
--   re-uploading a file with the same name adds a new version row instead
--   of overwriting — the table is the version history. Downloads use the
--   same short-lived signed URLs as the abstract .docx.
--
-- Where it's used
--   Loans tab → expanded loan detail → "Documents" section (list /
--   download for everyone; upload / delete behind the edit PIN).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.deal_documents (
  id           uuid primary key default gen_random_uuid(),
  loan_id      uuid not null references public.loans(id) on delete cascade,
  category     text not null default 'other'
               check (category in ('loan_agreement','guaranty','amendment','closing',
                                   'insurance','hedge','correspondence','other')),
  filename     text not null,
  storage_path text not null unique,
  note         text,
  uploaded_by  text,             -- email of the signed-in uploader
  uploaded_at  timestamptz not null default now()
);

create index if not exists deal_documents_loan_idx on public.deal_documents (loan_id);

-- Access: signed-in users only, matching db/security_setup.sql. The storage
-- policies on the loan-docs bucket already cover the docs/ prefix.
alter table public.deal_documents enable row level security;
drop policy if exists "deal_documents authenticated all" on public.deal_documents;
create policy "deal_documents authenticated all" on public.deal_documents
  for all to authenticated using (true) with check (true);
