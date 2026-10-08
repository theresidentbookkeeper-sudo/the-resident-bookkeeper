-- AI team inside TRB's own system: approvals, instructions, proof-based work log, Nani's daily brief.
create table if not exists public.trb_ai_work_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  employee_id text not null,
  job text not null,
  status text not null default 'done' check (status in ('done','failed','skipped')),
  summary text not null,
  proof jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trb_ai_work_log_created on public.trb_ai_work_log(created_at desc);

create table if not exists public.trb_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  employee_id text not null,
  kind text not null check (kind in ('social_post','outreach_message','other')),
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','done')),
  decided_by uuid,
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.trb_ai_instructions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.trb_business_owner_id(),
  employee_id text not null,
  instruction text not null check (length(instruction) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending','working','done','failed')),
  response text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.trb_daily_digest (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  digest_date date not null,
  headline text,
  body_text text not null,
  body_html text,
  data jsonb not null default '{}'::jsonb,
  emailed_at timestamptz,
  email_note text,
  created_at timestamptz not null default now(),
  unique (owner_id, digest_date)
);

alter table public.trb_ai_work_log enable row level security;
alter table public.trb_approvals enable row level security;
alter table public.trb_ai_instructions enable row level security;
alter table public.trb_daily_digest enable row level security;
create policy team_all on public.trb_ai_work_log for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
create policy team_all on public.trb_approvals for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
create policy team_all on public.trb_ai_instructions for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
create policy team_all on public.trb_daily_digest for all to authenticated using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());

insert into public.trb_internal_secrets(name, value) values ('workforce_cron_token', encode(gen_random_bytes(32),'hex')) on conflict (name) do nothing;

create or replace function private.trb_workforce_call(p_job text) returns bigint language sql security definer set search_path = public, extensions as $$
  select net.http_post(
    url := 'https://njhohxhtqkktktngjflb.supabase.co/functions/v1/trb-workforce',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qaG9oeGh0cWtrdGt0bmdqZmxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMDY5NTgsImV4cCI6MjEwMzg4Mjk1OH0.oeIqSVmvqCOofh5E6eZg4TguNfIt0JN-7wNwAlRf4fQ',
      'x-trb-cron',(select value from public.trb_internal_secrets where name='workforce_cron_token')),
    body := jsonb_build_object('action','run','job',p_job), timeout_milliseconds := 10000)
$$;
revoke all on function private.trb_workforce_call(text) from public, anon, authenticated;

-- Times are UTC (Lagos is UTC+1): Zara 06:00, Amara 06:30, Nani 07:00, Maya every two hours 08:00-20:00, instructions every 10 minutes when waiting.
select cron.schedule('trb-zara-daily',   '0 5 * * *',  $$select private.trb_workforce_call('zara')$$);
select cron.schedule('trb-amara-daily',  '30 5 * * *', $$select private.trb_workforce_call('amara')$$);
select cron.schedule('trb-nani-brief',   '0 6 * * *',  $$select private.trb_workforce_call('nani')$$);
select cron.schedule('trb-maya-leads',   '0 7-19/2 * * *', $$select private.trb_workforce_call('maya')$$);
select cron.schedule('trb-ai-instructions', '*/10 * * * *', $$select private.trb_workforce_call('instructions') where exists (select 1 from public.trb_ai_instructions where status='pending')$$);
