-- TRB income that does not come through a client invoice (app builds, consulting, training, one-off gigs)
create table if not exists public.trb_income (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.trb_business_owner_id(),
  income_date date not null default current_date,
  category text not null,
  payer text,
  client_id uuid references public.clients(id) on delete set null,
  description text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'NGN',
  received_via text not null default 'Bank transfer',
  received_into text,
  document_path text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists trb_income_date on public.trb_income(owner_id, income_date desc);
alter table public.trb_income enable row level security;
create policy team_all on public.trb_income for all to authenticated
  using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
