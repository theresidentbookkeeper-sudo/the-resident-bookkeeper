-- Books Lite engine: storage, client read-only results, team access, Nora instructions.

-- 1. Private bucket for statements and reports: <business_id>/statements/... and <business_id>/reports/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('books-lite', 'books-lite', false, 15728640)
on conflict (id) do nothing;

create policy bl_client_upload_statements on storage.objects for insert to authenticated
with check (
  bucket_id = 'books-lite'
  and (storage.foldername(name))[2] = 'statements'
  and exists (select 1 from public.books_lite_businesses b where b.id::text = (storage.foldername(name))[1] and b.owner_id = auth.uid())
);
create policy bl_client_read_own_files on storage.objects for select to authenticated
using (
  bucket_id = 'books-lite'
  and exists (select 1 from public.books_lite_businesses b where b.id::text = (storage.foldername(name))[1] and b.owner_id = auth.uid())
);
create policy bl_team_read_files on storage.objects for select to authenticated
using (bucket_id = 'books-lite' and public.trb_business_owner_id() is not null);

-- 2. Report files and summary
alter table public.books_lite_reports
  add column if not exists statement_id uuid references public.books_lite_statement_uploads(id) on delete set null,
  add column if not exists pdf_path text,
  add column if not exists xlsx_path text,
  add column if not exists summary jsonb not null default '{}'::jsonb,
  add column if not exists notified_at timestamptz;

alter table public.books_lite_statement_uploads
  add column if not exists nora_notes text,
  add column if not exists attempts integer not null default 0;

-- 3. Team can see and manage every Books Lite client
do $$ declare t text; begin
  foreach t in array array['businesses','bank_accounts','statement_uploads','transactions','reconciliations','reports','review_items','category_rules'] loop
    execute format('create policy bl_team_all on public.books_lite_%s for all to authenticated using (public.trb_business_owner_id() is not null) with check (public.trb_business_owner_id() is not null)', t);
  end loop;
end $$;
create policy bl_team_read_audit on public.books_lite_audit_log for select to authenticated using (public.trb_business_owner_id() is not null);

-- 4. Clients view only: Nora's results can only be written by the team (or Nora's server key, which bypasses these rules)
do $$ declare t text; begin
  foreach t in array array['transactions','reconciliations','reports','review_items','businesses','category_rules'] loop
    execute format('create policy bl_write_team_only_ins on public.books_lite_%s as restrictive for insert to authenticated with check (public.trb_business_owner_id() is not null)', t);
    execute format('create policy bl_write_team_only_upd on public.books_lite_%s as restrictive for update to authenticated using (public.trb_business_owner_id() is not null)', t);
    execute format('create policy bl_write_team_only_del on public.books_lite_%s as restrictive for delete to authenticated using (public.trb_business_owner_id() is not null)', t);
  end loop;
  -- clients may add statements and bank accounts, but not change or remove a statement once sent
  execute 'create policy bl_write_team_only_upd on public.books_lite_statement_uploads as restrictive for update to authenticated using (public.trb_business_owner_id() is not null)';
  execute 'create policy bl_write_team_only_del on public.books_lite_statement_uploads as restrictive for delete to authenticated using (public.trb_business_owner_id() is not null)';
end $$;

-- 5. Team instructions to Nora
create table if not exists public.books_lite_instructions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.books_lite_businesses(id) on delete cascade,
  created_by uuid default auth.uid(),
  instruction text not null check (length(instruction) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending','working','done','failed')),
  response text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.books_lite_instructions enable row level security;
create policy bl_team_instructions on public.books_lite_instructions for all to authenticated
using (public.trb_business_owner_id() is not null) with check (public.trb_business_owner_id() is not null);

-- 6. Clients only see finished work: statements folder in storage (reports come through Nora's signed links),
--    ready reports only, and no internal review notes.
alter policy bl_client_read_own_files on storage.objects using (
  bucket_id = 'books-lite'
  and (storage.foldername(name))[2] = 'statements'
  and exists (select 1 from public.books_lite_businesses b where b.id::text = (storage.foldername(name))[1] and b.owner_id = auth.uid())
);
create policy bl_reports_ready_only on public.books_lite_reports as restrictive for select to authenticated
using (status = 'ready' or public.trb_business_owner_id() is not null);
create policy bl_review_team_only on public.books_lite_review_items as restrictive for select to authenticated
using (public.trb_business_owner_id() is not null);

-- 7. Internal token for scheduled jobs, and Nora's 10-minute sweep (picks up anything missed or stuck)
create extension if not exists pg_net with schema extensions;
create table if not exists public.trb_internal_secrets (name text primary key, value text not null, created_at timestamptz not null default now());
alter table public.trb_internal_secrets enable row level security;
revoke all on public.trb_internal_secrets from anon, authenticated;
insert into public.trb_internal_secrets(name, value) values ('nora_cron_token', encode(gen_random_bytes(32),'hex')) on conflict (name) do nothing;

create or replace function private.nora_sweep() returns bigint language sql security definer set search_path = public, extensions as $$
  select net.http_post(
    url := 'https://njhohxhtqkktktngjflb.supabase.co/functions/v1/bookslite-nora',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qaG9oeGh0cWtrdGt0bmdqZmxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMDY5NTgsImV4cCI6MjEwMzg4Mjk1OH0.oeIqSVmvqCOofh5E6eZg4TguNfIt0JN-7wNwAlRf4fQ',
      'x-trb-cron',(select value from public.trb_internal_secrets where name='nora_cron_token')),
    body := '{"action":"sweep"}'::jsonb, timeout_milliseconds := 10000)
  where exists (select 1 from public.books_lite_statement_uploads where status in ('uploaded','extracting','processing') and attempts < 3)
     or exists (select 1 from public.books_lite_instructions where status = 'pending');
$$;
revoke all on function private.nora_sweep() from public, anon, authenticated;
select cron.schedule('trb-nora-sweep', '*/10 * * * *', 'select private.nora_sweep();');
