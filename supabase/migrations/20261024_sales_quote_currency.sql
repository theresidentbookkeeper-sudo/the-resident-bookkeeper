-- Quotes carry a country and currency; winning a quote creates a properly numbered invoice in that currency.
alter table public.sales_quotes add column if not exists currency text not null default 'NGN';
alter table public.sales_quotes add column if not exists country text;

create or replace function public.complete_sale_from_quote(p_quote_id uuid) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_lead public.leads%rowtype;
  v_client public.clients%rowtype;
  v_invoice public.invoices%rowtype;
  v_business_owner uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_business_owner := public.trb_business_owner_id();
  if v_business_owner is null then raise exception 'TRB team access is not configured'; end if;
  select * into v_quote from public.sales_quotes where id=p_quote_id and owner_id=v_business_owner for update;
  if v_quote.id is null then raise exception 'Quote not found or not owned by the current user'; end if;
  if v_quote.status <> 'Draft' then raise exception 'Only Draft quotes can be marked Won'; end if;
  if v_quote.lead_id is null then raise exception 'Quote is not linked to a lead'; end if;
  select * into v_lead from public.leads where id=v_quote.lead_id and owner_id=v_business_owner for update;
  if v_lead.id is null then raise exception 'Linked lead not found or not owned by the current user'; end if;
  if v_lead.converted_client_id is not null then
    select * into v_client from public.clients where id=v_lead.converted_client_id and owner_id=v_business_owner for update;
  end if;
  if v_client.id is null then
    insert into public.clients(owner_id,name,business_type,contact_name,phone,email,status,source_lead_id,product_code,product_name,access_type,country)
    values(v_business_owner,v_lead.name,v_lead.business_type,v_lead.name,v_lead.phone,v_lead.email,'Active',v_lead.id,v_lead.product_code,
      coalesce(v_lead.product_name,case when v_lead.product_code='BOOKSLITE' then 'TRB Books Lite' else 'Managed Bookkeeping' end),
      case when v_lead.product_code='BOOKSLITE' then 'bookslite' else 'managed_client' end, v_quote.country)
    returning * into v_client;
  else
    update public.clients set status='Active' where id=v_client.id returning * into v_client;
  end if;
  -- number is left empty so the invoice gets the next sequential INV-YYYY-0001 style number
  insert into public.invoices(owner_id,client_id,number,description,line_items,subtotal,amount,status,currency,category,bill_to,due_date)
  values(v_business_owner,v_client.id,'',coalesce(v_quote.scope,v_quote.package),
    jsonb_build_array(jsonb_build_object('description',v_quote.package||coalesce(' — '||nullif(v_quote.scope,''),''),'quantity',1,'rate',v_quote.amount,'amount',v_quote.amount)),
    v_quote.amount,v_quote.amount,'Draft',coalesce(v_quote.currency,'NGN'),'Bookkeeping services',
    jsonb_build_object('name',v_client.name,'contact',v_client.contact_name,'email',v_client.email,'phone',v_client.phone),
    current_date + 14)
  returning * into v_invoice;
  update public.leads set stage='Won',converted=true,converted_client_id=v_client.id where id=v_lead.id;
  update public.sales_quotes set status='Won',updated_at=now() where id=v_quote.id;
  insert into public.platform_events(event_type,source,entity_type,entity_id,owner_id,payload)
  values('sale.won','sales-workspace','invoice',v_invoice.id::text,v_business_owner,jsonb_build_object('quote_id',v_quote.id,'lead_id',v_lead.id,'client_id',v_client.id,'invoice_number',v_invoice.number,'amount',v_quote.amount,'currency',v_quote.currency));
  return jsonb_build_object('invoice_id',v_invoice.id,'client_id',v_client.id,'lead_id',v_lead.id,'quote_id',v_quote.id,'invoice_number',v_invoice.number);
end;
$$;

-- Ada's daily client review, 6:45am Lagos (before Nani's 7am brief)
-- select cron.schedule('trb-ada-daily', '45 5 * * *', $$select private.trb_workforce_call('ada')$$);
