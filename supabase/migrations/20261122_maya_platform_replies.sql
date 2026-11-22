-- Applied 22 Nov 2026 as migration "maya_platform_replies_no_signature".
-- Replies to public posts (Reddit, Nairaland, etc.) are posted from Nancy's own account, so Maya's signature is
-- not appended to approvals with payload.channel 'platform_reply' (as for 'upwork_proposal').
do $mig$
declare src text;
begin
  select pg_get_functiondef('private.trb_enforce_ai_message_signature'::regproc) into src;
  if position('platform_reply' in src) = 0 then
    src := replace(src, 'coalesce(new.payload->>''channel'', '''') = ''upwork_proposal'' or', 'coalesce(new.payload->>''channel'', '''') in (''upwork_proposal'', ''platform_reply'') or');
    execute src;
  end if;
end
$mig$;
