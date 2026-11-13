-- Team work email (applied to project njhohxhtqkktktngjflb on 13 Nov 2026 as migration "trb_team_mailboxes").
-- employees.work_email (must be @residentbookkeeper.com, unique); trb_inbox gains direction/to_email/cc_emails/employee_id/reply_to_id;
-- trb_my_work_email() + RLS so staff read and update only their own mailbox; trigger trb_team_mail_arrived links new mail
-- to the team member and emails them a short alert (no content) pointing to the workspace Mail tab.
-- Sending is done by the team-mail edge function (Resend, from the person's own address, saved as direction 'out').
alter table public.employees add column if not exists work_email text;
create unique index if not exists employees_work_email_key on public.employees (lower(work_email)) where work_email is not null;
alter table public.employees drop constraint if exists employees_work_email_domain;
alter table public.employees add constraint employees_work_email_domain check (work_email is null or work_email ~* '^[a-z0-9._-]+@residentbookkeeper\.com$');
alter table public.trb_inbox add column if not exists direction text not null default 'in';
alter table public.trb_inbox add column if not exists to_email text;
alter table public.trb_inbox add column if not exists cc_emails text[];
alter table public.trb_inbox add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.trb_inbox add column if not exists reply_to_id uuid references public.trb_inbox(id) on delete set null;
create index if not exists trb_inbox_mailbox_idx on public.trb_inbox (lower(mailbox), received_at desc);
create or replace function public.trb_my_work_email() returns text language sql stable security definer set search_path = public as $$
  select lower(work_email) from public.employees where portal_user_id = auth.uid() and status = 'Active' and work_email is not null limit 1
$$;
revoke all on function public.trb_my_work_email() from public, anon;
grant execute on function public.trb_my_work_email() to authenticated;
drop policy if exists staff_own_mailbox_read on public.trb_inbox;
create policy staff_own_mailbox_read on public.trb_inbox for select to authenticated using (lower(mailbox) = public.trb_my_work_email());
drop policy if exists staff_own_mailbox_status on public.trb_inbox;
create policy staff_own_mailbox_status on public.trb_inbox for update to authenticated using (lower(mailbox) = public.trb_my_work_email()) with check (lower(mailbox) = public.trb_my_work_email());
-- trb_team_mail_arrived(): see the live function in the database for the full alert text.
