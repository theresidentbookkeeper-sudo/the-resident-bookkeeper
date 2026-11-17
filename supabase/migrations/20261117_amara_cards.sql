-- Every Amara post drafted without a Manus visual gets a designed text card (amara-cards function).
create or replace function public.trb_amara_card_auto()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.kind = 'social_post' and new.employee_id = 'amara' and coalesce(new.payload->>'storage_path', '') = '' then
    perform net.http_post(
      url := 'https://njhohxhtqkktktngjflb.supabase.co/functions/v1/amara-cards',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-visuals-token', (select value from public.trb_internal_secrets where name = 'visuals_token')),
      body := jsonb_build_object('approval_id', new.id),
      timeout_milliseconds := 60000);
  end if;
  return new;
end $$;
drop trigger if exists trb_amara_card_auto on public.trb_approvals;
create trigger trb_amara_card_auto after insert on public.trb_approvals
for each row execute function public.trb_amara_card_auto();
