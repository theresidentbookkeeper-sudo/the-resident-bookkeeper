-- Hourly: copy new visuals from Cue's Google Drive folder ("Manus Visuals") into Amara's queue.
-- (visuals_token is created in trb_internal_secrets.)
select cron.schedule('trb-visuals-pickup', '15 * * * *', $$select net.http_post(url:='https://njhohxhtqkktktngjflb.supabase.co/functions/v1/visuals-pickup', headers:=jsonb_build_object('Content-Type','application/json','x-visuals-token',(select value from public.trb_internal_secrets where name='visuals_token')), body:='{}'::jsonb, timeout_milliseconds:=60000)$$);
