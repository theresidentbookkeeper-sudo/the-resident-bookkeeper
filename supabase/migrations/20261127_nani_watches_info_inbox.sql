-- Nani reads team emails that arrive at info@: Kemi questions become practice requests; anything else is acknowledged and passed to Nancy.
create or replace function public.trb_nani_team_email()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.direction = 'in' and lower(coalesce(new.mailbox, '')) = 'info@residentbookkeeper.com'
     and lower(coalesce(new.from_email, '')) like '%@residentbookkeeper.com'
     and lower(new.from_email) <> 'info@residentbookkeeper.com' then
    perform net.http_post(
      url := 'https://njhohxhtqkktktngjflb.supabase.co/functions/v1/nani-practice',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-nani-token', (select value from public.trb_internal_secrets where name = 'nani_practice_token')),
      body := jsonb_build_object('inbox_id', new.id),
      timeout_milliseconds := 30000);
  end if;
  return new;
end $$;
drop trigger if exists trb_nani_team_email on public.trb_inbox;
create trigger trb_nani_team_email after insert on public.trb_inbox
for each row execute function public.trb_nani_team_email();
