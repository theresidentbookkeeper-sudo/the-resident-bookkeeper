-- Manual invoices: raise an invoice to any client (or typed-in customer), in NGN or USD.
alter table public.invoices add column if not exists currency text not null default 'NGN';
alter table public.invoices add column if not exists bill_to jsonb;          -- customer details snapshot (name, contact, email, phone, address)
alter table public.invoices add column if not exists category text;          -- type of income, e.g. Bookkeeping services, App & software development
alter table public.invoices add column if not exists notes text;             -- payment terms / note printed on the invoice
alter table public.invoices alter column owner_id set default coalesce(public.trb_business_owner_id(), auth.uid());
alter table public.clients alter column owner_id set default coalesce(public.trb_business_owner_id(), auth.uid());

-- Sequential numbers: INV-2026-0001, INV-2026-0002 ... (only when no number is given)
create or replace function private.trb_invoice_number() returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.number is null or new.number = '' then
    perform pg_advisory_xact_lock(hashtext('trb_invoice_number' || new.owner_id::text));
    select coalesce(max(regexp_replace(number, '^INV-\d{4}-', '')::int), 0) + 1 into n
      from public.invoices
     where owner_id = new.owner_id and number ~ ('^INV-' || to_char(coalesce(new.issue_date, current_date), 'YYYY') || '-\d+$');
    new.number := 'INV-' || to_char(coalesce(new.issue_date, current_date), 'YYYY') || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;
create trigger trg_invoice_number before insert on public.invoices for each row execute function private.trb_invoice_number();

-- US dollar receiving account shown on USD invoices
alter table public.profile add column if not exists usd_bank_name text;
alter table public.profile add column if not exists usd_account_name text;
alter table public.profile add column if not exists usd_account_number text;
alter table public.profile add column if not exists usd_routing_number text;
alter table public.profile add column if not exists usd_account_type text;

create or replace function public.trb_business_card() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('business_name',business_name,'address',address,'phone',phone,'email',email,'tin',tin,
    'bank_name',bank_name,'account_name',account_name,'account_number',account_number,
    'usd_bank_name',usd_bank_name,'usd_account_name',usd_account_name,'usd_account_number',usd_account_number,
    'usd_routing_number',usd_routing_number,'usd_account_type',usd_account_type)
  from public.profile order by updated_at desc limit 1
$$;
