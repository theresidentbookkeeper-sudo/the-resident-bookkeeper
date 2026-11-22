-- Applied 22 Nov 2026 as migration "maya_upwork_proposals_no_signature".
-- Upwork proposals are sent from Nancy's own Upwork account and signed by her, so the trigger that appends
-- Maya's signature (private.trb_enforce_ai_message_signature) now skips approvals whose payload.channel = 'upwork_proposal'.
do $mig$
declare src text;
begin
  select pg_get_functiondef('private.trb_enforce_ai_message_signature'::regproc) into src;
  if position('upwork_proposal' in src) = 0 then
    src := replace(src, 'if new.kind = ''social_post'' or', 'if new.kind = ''social_post'' or coalesce(new.payload->>''channel'', '''') = ''upwork_proposal'' or');
    execute src;
  end if;
end
$mig$;
