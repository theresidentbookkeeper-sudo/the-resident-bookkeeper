-- Freelance staff: limited access to assigned clients only, client assignments, payouts.
-- 1. Employees get an access level. Admin = full team access (as before). Staff = assigned clients only.
alter table public.employees add column if not exists access_level text not null default 'staff' check (access_level in ('admin','staff'));
alter table public.employees add column if not exists country text;
alter table public.employees add column if not exists specialty text;
alter table public.employees add column if not exists share_pct numeric(5,2) not null default 30 check (share_pct between 0 and 100);
alter table public.employees add column if not exists payout_currency text not null default 'NGN';
alter table public.employees add column if not exists payout_method text;
alter table public.employees add column if not exists payout_details text;
alter table public.employees add column if not exists start_date date;
alter table public.employees add column if not exists bio text;
alter table public.employees add column if not exists credentials text;
alter table public.employees add column if not exists show_on_site boolean not null default false;
-- people added before this change keep full access
update public.employees set access_level = 'admin' where created_at < '2026-10-10';

create or replace function public.trb_business_owner_id() returns uuid language sql stable security definer set search_path to 'public' as $$
  select p.owner_id from public.profile p
  where p.owner_id = auth.uid()
     or exists (select 1 from public.employees e where e.owner_id = p.owner_id and e.portal_user_id = auth.uid() and e.status = 'Active' and e.access_level = 'admin')
  order by p.updated_at desc limit 1
$$;

create or replace function public.trb_staff_employee_id() returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from public.employees where portal_user_id = auth.uid() and status = 'Active' and access_level = 'staff' limit 1
$$;
create or replace function public.trb_staff_owner_id() returns uuid language sql stable security definer set search_path to 'public' as $$
  select owner_id from public.employees where portal_user_id = auth.uid() and status = 'Active' and access_level = 'staff' limit 1
$$;

-- 2. Which staff member looks after which client
create table if not exists public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.trb_business_owner_id(),
  client_id uuid not null references public.clients(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  role text not null default 'bookkeeper' check (role in ('bookkeeper','reviewer')),
  share_pct numeric(5,2) not null default 30 check (share_pct between 0 and 100),
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now()
);
create index if not exists client_assignments_emp on public.client_assignments(employee_id);
create index if not exists client_assignments_client on public.client_assignments(client_id);
alter table public.client_assignments enable row level security;

create or replace function public.trb_staff_client_ids() returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select a.client_id from public.client_assignments a join public.employees e on e.id = a.employee_id
  where e.portal_user_id = auth.uid() and e.status = 'Active' and e.access_level = 'staff'
    and a.start_date <= current_date and (a.end_date is null or a.end_date >= current_date)
$$;

-- 3. Payouts owed to staff (one row per staff member per paid invoice)
create table if not exists public.staff_payouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.trb_business_owner_id(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  period date not null,
  fee_amount numeric(14,2) not null,
  share_pct numeric(5,2) not null,
  amount numeric(14,2) not null,
  currency text not null,
  status text not null default 'paid' check (status in ('paid','withheld')),
  reference text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (employee_id, invoice_id)
);
alter table public.staff_payouts enable row level security;

create policy team_all on public.client_assignments for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
create policy staff_read_own on public.client_assignments for select to authenticated using (employee_id = public.trb_staff_employee_id());
create policy team_all on public.staff_payouts for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
create policy staff_read_own on public.staff_payouts for select to authenticated using (employee_id = public.trb_staff_employee_id());

-- 4. Staff can work on their assigned clients' portal records only
alter table public.client_reports add column if not exists submitted_at timestamptz;
alter table public.client_reports add column if not exists submitted_by uuid;
alter table public.client_reports alter column owner_id set default coalesce(public.trb_business_owner_id(), public.trb_staff_owner_id());
alter table public.client_files alter column owner_id set default coalesce(public.trb_business_owner_id(), public.trb_staff_owner_id());
alter table public.client_document_requests alter column owner_id set default coalesce(public.trb_business_owner_id(), public.trb_staff_owner_id());

create policy staff_read on public.clients for select to authenticated using (id in (select public.trb_staff_client_ids()));

create policy staff_read on public.client_files for select to authenticated using (client_id in (select public.trb_staff_client_ids()));
create policy staff_insert on public.client_files for insert to authenticated with check (client_id in (select public.trb_staff_client_ids()) and owner_id = public.trb_staff_owner_id() and uploader = 'team');

create policy staff_read on public.client_document_requests for select to authenticated using (client_id in (select public.trb_staff_client_ids()));
create policy staff_insert on public.client_document_requests for insert to authenticated with check (client_id in (select public.trb_staff_client_ids()) and owner_id = public.trb_staff_owner_id());
create policy staff_update on public.client_document_requests for update to authenticated using (client_id in (select public.trb_staff_client_ids())) with check (client_id in (select public.trb_staff_client_ids()));

-- reports: staff prepare and submit; only Nancy (admin) sends to the client or finalises
create policy staff_read on public.client_reports for select to authenticated using (client_id in (select public.trb_staff_client_ids()));
create policy staff_insert on public.client_reports for insert to authenticated with check (client_id in (select public.trb_staff_client_ids()) and owner_id = public.trb_staff_owner_id() and status = 'preparing');
create policy staff_update on public.client_reports for update to authenticated using (client_id in (select public.trb_staff_client_ids()) and status = 'preparing') with check (client_id in (select public.trb_staff_client_ids()) and status = 'preparing');

create policy staff_read on public.client_report_files for select to authenticated using (client_id in (select public.trb_staff_client_ids()));
create policy staff_insert on public.client_report_files for insert to authenticated with check (client_id in (select public.trb_staff_client_ids()) and report_id in (select id from public.client_reports where status = 'preparing' and client_id in (select public.trb_staff_client_ids())));

create policy staff_read on public.client_report_notes for select to authenticated using (client_id in (select public.trb_staff_client_ids()));
create policy staff_insert on public.client_report_notes for insert to authenticated with check (client_id in (select public.trb_staff_client_ids()) and author_type = 'team' and author_id = auth.uid());

create policy client_files_staff_read on storage.objects for select to authenticated using (bucket_id = 'client-files' and (storage.foldername(name))[1] in (select id::text from public.trb_staff_client_ids() id));
create policy client_files_staff_upload on storage.objects for insert to authenticated with check (bucket_id = 'client-files' and (storage.foldername(name))[1] in (select id::text from public.trb_staff_client_ids() id));
