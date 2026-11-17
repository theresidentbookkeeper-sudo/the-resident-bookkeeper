-- Nani answers bookkeepers' document requests on PRACTICE clients from the held-back practice folder (no approval step).
insert into public.trb_internal_secrets(name, value)
values ('nani_practice_token', md5(random()::text || clock_timestamp()::text) || md5(random()::text))
on conflict (name) do nothing;

create or replace function public.trb_practice_request_auto()
returns trigger language plpgsql security definer set search_path to '' as $$
declare cname text; tok text;
begin
  select name into cname from public.clients where id = new.client_id;
  if cname is null or cname not ilike 'PRACTICE%' then return new; end if;
  select value into tok from public.trb_internal_secrets where name = 'nani_practice_token';
  perform net.http_post(
    url := 'https://njhohxhtqkktktngjflb.supabase.co/functions/v1/nani-practice',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nani-token', tok),
    body := jsonb_build_object('request_id', new.id),
    timeout_milliseconds := 30000);
  return new;
end $$;

drop trigger if exists trb_practice_request_auto on public.client_document_requests;
create trigger trb_practice_request_auto after insert on public.client_document_requests
for each row execute function public.trb_practice_request_auto();

-- Nancy no longer gets the "send it yourself" email for practice clients; Nani tells her what was sent instead.
create or replace function public.trb_notify_doc_request()
 returns trigger language plpgsql security definer set search_path to '' as $function$
declare c record; who text;
begin
  select name, email, portal_user_id into c from public.clients where id = new.client_id;
  if c.name ilike 'PRACTICE%' then return new; end if;
  select name into who from public.employees where portal_user_id = auth.uid() and access_level = 'staff';
  if who is not null then
    perform public.trb_send_email('theresidentbookkeeper@gmail.com',
      'Document request from ' || who || ': ' || coalesce(c.name, 'client'),
      'Hello Nancy,' || chr(10) || chr(10) || who || ' has asked ' || coalesce(c.name, 'a client') || ' for: ' || new.title ||
      coalesce(chr(10) || 'Details: ' || new.details, '') || coalesce(chr(10) || 'Due: ' || new.due_date::text, '') || chr(10) || chr(10) ||
      case when c.portal_user_id is null then 'This client has no portal login, so they will not see it. Send the file yourself (reply to the bookkeeper or upload it for the client).'
           else 'The client can see it in their portal and has been emailed.' end || chr(10) || chr(10) ||
      'Open the client: https://residentbookkeeper.com/platform?view=clients' || chr(10) || chr(10) || 'Best regards,' || chr(10) || 'Nani' || chr(10) || 'RESIDENT BOOKKEEPER');
  end if;
  if c.portal_user_id is not null and coalesce(c.email, '') <> '' then
    perform public.trb_send_email(c.email, 'Document request from The Resident Bookkeeper: ' || new.title,
      'Hello,' || chr(10) || chr(10) || 'Your bookkeeper needs: ' || new.title || coalesce(chr(10) || new.details, '') ||
      coalesce(chr(10) || 'Please send it by ' || new.due_date::text, '') || '.' || chr(10) || chr(10) ||
      'Upload it in your portal: https://residentbookkeeper.com/platform' || chr(10) || chr(10) || 'Best regards,' || chr(10) || 'Nani' || chr(10) || 'RESIDENT BOOKKEEPER');
  end if;
  return new;
end $function$;
