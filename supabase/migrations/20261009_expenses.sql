-- TRB's own expenses (money out) for the Finance screen, with private receipt storage.
create table if not exists public.trb_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.trb_business_owner_id(),
  expense_date date not null default current_date,
  category text not null,
  payee text,
  description text,
  amount numeric(14,2) not null check (amount > 0),
  vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),
  currency text not null default 'NGN',
  payment_method text not null default 'Bank transfer',
  paid_from text,
  recurring boolean not null default false,
  receipt_path text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trb_expenses_date on public.trb_expenses(owner_id, expense_date desc);
alter table public.trb_expenses enable row level security;
create policy team_all on public.trb_expenses for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
insert into storage.buckets (id, name, public, file_size_limit) values ('trb-finance','trb-finance',false,15728640) on conflict (id) do nothing;
create policy trb_finance_team on storage.objects for all to authenticated using (bucket_id = 'trb-finance' and public.trb_business_owner_id() is not null) with check (bucket_id = 'trb-finance' and public.trb_business_owner_id() is not null);
