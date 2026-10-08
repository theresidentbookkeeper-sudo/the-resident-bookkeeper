-- Managed client portal: document requests, client uploads, report review cycle, receipts.
-- Team = public.trb_business_owner_id() is not null (business owner or active employee).
-- A client = the clients row whose portal_user_id is auth.uid().

create or replace function public.trb_my_client_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.clients where portal_user_id = auth.uid()
$$;
revoke all on function public.trb_my_client_ids() from public, anon;
grant execute on function public.trb_my_client_ids() to authenticated;

-- 1. Documents TRB asks the client for
create table if not exists public.client_document_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.trb_business_owner_id(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null check (length(title) between 2 and 200),
  details text,
  period_start date,
  due_date date,
  status text not null default 'requested' check (status in ('requested','uploaded','accepted','cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Files the client sends (statements, requested documents, anything else)
create table if not exists public.client_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  request_id uuid references public.client_document_requests(id) on delete set null,
  category text not null default 'other' check (category in ('bank_statement','requested_document','receipt_or_invoice','other')),
  period_start date,
  file_name text not null,
  storage_path text not null unique,
  note text,
  uploaded_by uuid default auth.uid(),
  uploader text not null default 'client' check (uploader in ('client','team')),
  created_at timestamptz not null default now()
);

-- 3. Reports TRB prepares, the client reviews, TRB finalises
create table if not exists public.client_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.trb_business_owner_id(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  period_type text not null default 'monthly' check (period_type in ('monthly','quarterly','annual','other')),
  period_start date,
  period_end date,
  status text not null default 'preparing' check (status in ('preparing','for_review','client_reviewed','final')),
  summary text,
  sent_at timestamptz,
  reviewed_at timestamptz,
  finalised_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.client_report_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.client_reports(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  kind text not null default 'other' check (kind in ('pdf','excel','csv','other')),
  version int not null default 1,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.client_report_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.client_reports(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid not null default auth.uid(),
  author_type text not null check (author_type in ('client','team')),
  note_type text not null default 'note' check (note_type in ('note','correction','recommendation','question','reply')),
  body text not null check (length(body) between 1 and 4000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- 4. Receipts on paid invoices
alter table public.invoices add column if not exists receipt_number text;
create or replace function private.trb_invoice_receipt() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'Paid' and (old.status is distinct from 'Paid') then
    new.paid_date := coalesce(new.paid_date, current_date);
    new.receipt_number := coalesce(new.receipt_number, 'RCT-' || coalesce(nullif(new.number,''), to_char(now(),'YYYYMMDD') || '-' || left(new.id::text,4)));
  end if;
  return new;
end $$;
create trigger trg_invoice_receipt before update on public.invoices for each row execute function private.trb_invoice_receipt();

-- Business details shown on invoices and receipts (meant to be seen by clients)
create or replace function public.trb_business_card() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('business_name',business_name,'address',address,'phone',phone,'email',email,'tin',tin,'bank_name',bank_name,'account_name',account_name,'account_number',account_number)
  from public.profile order by updated_at desc limit 1
$$;
revoke all on function public.trb_business_card() from public, anon;
grant execute on function public.trb_business_card() to authenticated;

-- 5. Client actions that change status go through checked functions
create or replace function public.client_submit_file(p_client uuid, p_path text, p_name text, p_category text, p_period date, p_request uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id uuid;
begin
  select owner_id into v_owner from public.clients where id = p_client and portal_user_id = auth.uid();
  if v_owner is null then raise exception 'Not your client account'; end if;
  if split_part(p_path,'/',1) <> p_client::text or split_part(p_path,'/',2) <> 'uploads' then raise exception 'Invalid file location'; end if;
  insert into public.client_files(owner_id, client_id, request_id, category, period_start, file_name, storage_path, note, uploader)
  values (v_owner, p_client, p_request, coalesce(p_category,'other'), p_period, p_name, p_path, p_note, 'client') returning id into v_id;
  if p_request is not null then
    update public.client_document_requests set status = 'uploaded', updated_at = now() where id = p_request and client_id = p_client and status = 'requested';
  end if;
  return v_id;
end $$;
revoke all on function public.client_submit_file(uuid,text,text,text,date,uuid,text) from public, anon;
grant execute on function public.client_submit_file(uuid,text,text,text,date,uuid,text) to authenticated;

create or replace function public.client_mark_report_reviewed(p_report uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.client_reports set status = 'client_reviewed', reviewed_at = now(), updated_at = now()
  where id = p_report and status = 'for_review' and client_id in (select public.trb_my_client_ids());
  if not found then raise exception 'This report cannot be marked reviewed.'; end if;
end $$;
revoke all on function public.client_mark_report_reviewed(uuid) from public, anon;
grant execute on function public.client_mark_report_reviewed(uuid) to authenticated;

-- 6. Row level security
alter table public.client_document_requests enable row level security;
alter table public.client_files enable row level security;
alter table public.client_reports enable row level security;
alter table public.client_report_files enable row level security;
alter table public.client_report_notes enable row level security;

create policy team_all on public.client_document_requests for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
create policy client_read on public.client_document_requests for select to authenticated using (client_id in (select public.trb_my_client_ids()) and status <> 'cancelled');

create policy team_all on public.client_files for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
create policy client_read on public.client_files for select to authenticated using (client_id in (select public.trb_my_client_ids()));

create policy team_all on public.client_reports for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
create policy client_read on public.client_reports for select to authenticated using (client_id in (select public.trb_my_client_ids()) and status <> 'preparing');

create policy team_all on public.client_report_files for all to authenticated using (public.trb_business_owner_id() is not null) with check (public.trb_business_owner_id() is not null);
create policy client_read on public.client_report_files for select to authenticated using (report_id in (select id from public.client_reports where client_id in (select public.trb_my_client_ids()) and status <> 'preparing'));

create policy team_all on public.client_report_notes for all to authenticated using (public.trb_business_owner_id() is not null) with check (public.trb_business_owner_id() is not null and author_type = 'team');
create policy client_read on public.client_report_notes for select to authenticated using (report_id in (select id from public.client_reports where client_id in (select public.trb_my_client_ids()) and status <> 'preparing'));
create policy client_write on public.client_report_notes for insert to authenticated with check (
  author_type = 'client' and author_id = auth.uid() and note_type in ('note','correction','recommendation','question')
  and report_id in (select id from public.client_reports where client_id in (select public.trb_my_client_ids()) and status in ('for_review','client_reviewed','final'))
  and client_id in (select public.trb_my_client_ids()));

-- 7. Storage (bucket client-files): <client_id>/uploads/... from the client, <client_id>/reports/... from TRB
alter policy client_files_access on storage.objects
  using (bucket_id = 'client-files' and public.trb_business_owner_id() is not null)
  with check (bucket_id = 'client-files' and public.trb_business_owner_id() is not null);
create policy client_files_client_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'client-files' and (storage.foldername(name))[2] = 'uploads'
  and (storage.foldername(name))[1] in (select id::text from public.trb_my_client_ids() id));
create policy client_files_client_read on storage.objects for select to authenticated using (
  bucket_id = 'client-files' and (storage.foldername(name))[1] in (select id::text from public.trb_my_client_ids() id)
  and ((storage.foldername(name))[2] = 'uploads'
       or exists (select 1 from public.client_report_files f join public.client_reports r on r.id = f.report_id
                  where f.storage_path = storage.objects.name and r.status <> 'preparing')));
