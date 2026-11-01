-- Where each website enquiry came from: the page it was sent from, the page the visitor first landed on,
-- the site that referred them, and any campaign tags (utm_*) on the link they followed.
alter table public.public_lead_intake
  add column if not exists landing_page text,
  add column if not exists first_landing_page text,
  add column if not exists referrer text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

alter table public.leads
  add column if not exists landing_page text,
  add column if not exists first_landing_page text,
  add column if not exists referrer text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists acquisition_channel text;

-- Simple channel label from the tags and referrer, so Maya can report enquiries by channel.
create or replace function public.trb_acquisition_channel(p_source text, p_medium text, p_referrer text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_medium,'')) in ('cpc','ppc','paid','paid_social') then 'Paid'
    when lower(coalesce(p_source,'')) like '%whatsapp%' or lower(coalesce(p_referrer,'')) like '%whatsapp%' or lower(coalesce(p_referrer,'')) like '%wa.me%' then 'WhatsApp'
    when lower(coalesce(p_medium,'')) = 'email' or lower(coalesce(p_source,'')) like '%email%' then 'Email'
    when lower(coalesce(p_source,'')) ~ '(facebook|instagram|fb|ig|linkedin|tiktok|twitter|x\.com)' or lower(coalesce(p_referrer,'')) ~ '(facebook|instagram|linkedin|tiktok|t\.co|twitter|x\.com|lnkd)' then 'Social'
    when lower(coalesce(p_referrer,'')) ~ '(google\.|bing\.|yahoo\.|duckduckgo|ecosia|yandex)' then 'Organic search'
    when lower(coalesce(p_referrer,'')) ~ '(chatgpt|openai|perplexity|gemini|copilot|claude)' then 'AI search'
    when coalesce(p_source,'') <> '' then 'Campaign'
    when coalesce(p_referrer,'') <> '' then 'Referral'
    else 'Direct'
  end
$$;

create or replace function public.process_public_lead_intake()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare new_lead_id uuid; business_owner uuid; v_product_code text; v_product_name text; v_channel text;
begin
  select owner_id into business_owner from public.profile order by updated_at desc limit 1;
  if business_owner is null then raise exception 'TRB business owner is not configured'; end if;
  v_product_code := case when lower(coalesce(new.service,'')) like '%books lite%' then 'BOOKSLITE' else null end;
  v_product_name := case when v_product_code = 'BOOKSLITE' then 'TRB Books Lite' else null end;
  v_channel := public.trb_acquisition_channel(new.utm_source, new.utm_medium, new.referrer);

  insert into public.leads(owner_id,name,business_type,phone,email,source,notes,stage,converted,product_code,product_name,country,
                           landing_page,first_landing_page,referrer,utm_source,utm_medium,utm_campaign,acquisition_channel)
  values(business_owner,new.name,new.business,new.phone,new.email,new.source,
         concat_ws(E'\n','Service: '||coalesce(new.service,''),'Message: '||coalesce(new.message,''),
                   'Channel: '||v_channel,
                   case when new.landing_page is not null then 'Sent from: '||new.landing_page end,
                   case when new.first_landing_page is not null then 'First landed on: '||new.first_landing_page end,
                   case when new.referrer is not null then 'Referred by: '||new.referrer end,
                   case when new.utm_campaign is not null then 'Campaign: '||new.utm_campaign end),
         'New',false,v_product_code,v_product_name,new.country,
         new.landing_page,new.first_landing_page,new.referrer,new.utm_source,new.utm_medium,new.utm_campaign,v_channel)
  returning id into new_lead_id;

  insert into public.platform_events(event_type,source,entity_type,entity_id,owner_id,payload)
  values('lead.created','public-website','lead',new_lead_id::text,business_owner,
         jsonb_build_object('business',new.business,'email',new.email,'phone',new.phone,'country',new.country,'service',new.service,
                            'product_code',v_product_code,'channel',v_channel,'landing_page',new.landing_page,
                            'first_landing_page',new.first_landing_page,'referrer',new.referrer,
                            'utm_source',new.utm_source,'utm_medium',new.utm_medium,'utm_campaign',new.utm_campaign));

  insert into public.sales_followups(owner_id,lead_id,title,message,channel,due_at,status) values
    (business_owner,new_lead_id,'Initial response',case when v_product_code='BOOKSLITE' then 'Thank you for choosing TRB Books Lite. Maya will follow up to confirm fit and next steps.' else 'Thank you for reaching out to The Resident Bookkeeper. We have received your enquiry and will review your bookkeeping needs.' end,'WhatsApp',now(),'Pending'),
    (business_owner,new_lead_id,'Helpful check-in','Just checking in on your enquiry. We can help you identify the right next step.','WhatsApp',now()+interval '2 days','Pending'),
    (business_owner,new_lead_id,'Decision follow-up',case when v_product_code='BOOKSLITE' then 'Following up on TRB Books Lite. If you are ready to proceed, we can prepare the invoice.' else 'Following up on your bookkeeping enquiry. If you are ready, we can confirm the scope and prepare your quote.' end,'WhatsApp',now()+interval '5 days','Pending'),
    (business_owner,new_lead_id,'Final gentle follow-up','A quick final check-in from The Resident Bookkeeper. We are happy to help whenever you are ready.','WhatsApp',now()+interval '10 days','Pending');

  insert into public.ai_employee_tasks(employee_id,owner_id,title,description,category,priority,status) values
    ('amara',business_owner,'New lead content/engagement review','Turn the lead context into an approved content or engagement opportunity. Do not publish without approval.','Lead Generation','High','Queued'),
    ('maya',business_owner,'Qualify new lead','Review the new enquiry (channel: '||v_channel||'), identify the next sales step and prepare the appropriate follow-up within approved pricing. Record it as a genuine website enquiry, separate from researched prospects.','Sales','High','Queued');
  return new;
end; $function$;

-- Backfill a channel label for existing website enquiries.
update public.leads set acquisition_channel = 'Direct' where acquisition_channel is null and source ilike any (array['%website%','%pricing%','%health check%']);
