-- AI inbox: a copy of every email sent to @residentbookkeeper.com (Gmail still gets the original)
create table if not exists public.trb_inbox (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  message_id text,
  mailbox text,                 -- which of our addresses received it (info@, nancybello@, support@ ...)
  from_email text,
  from_name text,
  subject text,
  text_body text,               -- left empty for security emails (codes, password resets)
  snippet text,
  received_at timestamptz not null default now(),
  category text not null default 'other' check (category in ('client','lead','money','security','notification','other')),
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  client_id uuid references public.clients(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'new' check (status in ('new','read','done')),
  has_attachments boolean not null default false,
  attachment_names text[],
  ai_summary text,
  created_at timestamptz not null default now(),
  unique (owner_id, message_id)
);
create index if not exists trb_inbox_recent on public.trb_inbox(owner_id, received_at desc);
alter table public.trb_inbox enable row level security;
create policy team_all on public.trb_inbox for all to authenticated
  using (owner_id = public.trb_business_owner_id()) with check (owner_id = public.trb_business_owner_id());
