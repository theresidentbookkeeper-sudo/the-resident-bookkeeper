begin;
revoke execute on function public.prepare_client_from_paid_invoice() from anon,authenticated;
revoke execute on function public.process_public_lead_intake() from anon,authenticated;
drop policy if exists "public_lead_intake_read" on public.public_lead_intake;
create or replace function public.process_public_lead_intake() returns trigger language plpgsql security definer set search_path=public as $$
declare new_lead_id uuid; business_owner uuid; v_product_code text; v_product_name text;
begin
 select owner_id into business_owner from public.profile order by updated_at desc limit 1;
 if business_owner is null then raise exception 'TRB business owner is not configured'; end if;
 v_product_code:=case when lower(coalesce(new.service,'')) like '%books lite%' then 'BOOKSLITE' else null end;
 v_product_name:=case when v_product_code='BOOKSLITE' then 'TRB Books Lite' else null end;
 insert into public.leads(owner_id,name,business_type,phone,email,source,notes,stage,converted,product_code,product_name)
 values(business_owner,new.name,new.business,new.phone,new.email,new.source,concat_ws(E'\n','Service: '||coalesce(new.service,''),'Message: '||coalesce(new.message,'')),'New',false,v_product_code,v_product_name) returning id into new_lead_id;
 insert into public.platform_events(event_type,source,entity_type,entity_id,owner_id,payload) values('lead.created','public-website','lead',new_lead_id::text,business_owner,jsonb_build_object('service',new.service,'product_code',v_product_code));
 insert into public.sales_followups(owner_id,lead_id,title,message,channel,due_at,status) values
 (business_owner,new_lead_id,'Initial response','Thank you for reaching out to The Resident Bookkeeper. We have received your enquiry and will review your bookkeeping needs.','WhatsApp',now(),'Pending'),
 (business_owner,new_lead_id,'Helpful check-in','Just checking in on your bookkeeping enquiry. We can help you identify the right next step.','WhatsApp',now()+interval '2 days','Pending'),
 (business_owner,new_lead_id,'Decision follow-up','Following up on your bookkeeping enquiry. If you are ready, we can confirm the scope and prepare your quote.','WhatsApp',now()+interval '5 days','Pending'),
 (business_owner,new_lead_id,'Final gentle follow-up','A quick final check-in from The Resident Bookkeeper. We are happy to help whenever you are ready.','WhatsApp',now()+interval '10 days','Pending');
 insert into public.ai_employee_tasks(employee_id,owner_id,title,description,category,priority,status) values
 ('amara',business_owner,'Review new public lead','Review the new website enquiry and identify a useful organic content or engagement opportunity.','Lead Generation','High','Queued'),
 ('maya',business_owner,'Qualify new public lead','Review the enquiry and prepare the next approved sales step.','Sales','High','Queued');
 return new;
end; $$;
create or replace function public.trb_business_owner_id() returns uuid language sql stable security definer set search_path=public as $$
 select p.owner_id from public.profile p where p.owner_id=auth.uid() or exists(select 1 from public.employees e where e.owner_id=p.owner_id and e.portal_user_id=auth.uid() and e.status='Active') order by p.updated_at desc limit 1 $$;
grant execute on function public.trb_business_owner_id() to authenticated;
create or replace function public.complete_sale_from_quote(p_quote_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare q public.sales_quotes%rowtype;l public.leads%rowtype;c public.clients%rowtype;i public.invoices%rowtype;owner uuid;num text;
begin
 owner:=public.trb_business_owner_id(); if owner is null then raise exception 'TRB team access is not configured'; end if;
 select * into q from public.sales_quotes where id=p_quote_id and owner_id=owner for update; if q.id is null then raise exception 'Quote not found or not owned by current user'; end if;
 if q.status<>'Draft' then raise exception 'Only Draft quotes can be marked Won'; end if;
 select * into l from public.leads where id=q.lead_id and owner_id=owner for update; if l.id is null then raise exception 'Linked lead not found'; end if;
 if l.converted_client_id is not null then select * into c from public.clients where id=l.converted_client_id and owner_id=owner for update; end if;
 if c.id is null then insert into public.clients(owner_id,name,business_type,contact_name,phone,email,status,source_lead_id,product_code,product_name,access_type)
 values(owner,l.name,l.business_type,l.name,l.phone,l.email,'Active',l.id,l.product_code,coalesce(l.product_name,'Managed Bookkeeping'),case when l.product_code='BOOKSLITE' then 'bookslite' else 'managed_client' end) returning * into c; end if;
 num:='INV-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.invoices(owner_id,client_id,number,description,line_items,subtotal,amount,status) values(owner,c.id,num,coalesce(q.scope,q.package),jsonb_build_array(jsonb_build_object('description',q.package,'amount',q.amount)),q.amount,q.amount,'Draft') returning * into i;
 update public.leads set stage='Won',converted=true,converted_client_id=c.id where id=l.id; update public.sales_quotes set status='Won',updated_at=now() where id=q.id;
 return jsonb_build_object('invoice_id',i.id,'client_id',c.id,'lead_id',l.id,'quote_id',q.id,'invoice_number',i.number);
end; $$;
revoke execute on function public.complete_sale_from_quote(uuid) from anon; grant execute on function public.complete_sale_from_quote(uuid) to authenticated;
commit;