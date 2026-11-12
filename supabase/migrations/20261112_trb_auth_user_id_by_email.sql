-- Service-role-only lookup used by employee-access-provision (supabase-js v2 has no getUserByEmail).
create or replace function public.trb_auth_user_id_by_email(p_email text)
returns uuid language sql security definer set search_path = '' stable as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;
revoke all on function public.trb_auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.trb_auth_user_id_by_email(text) to service_role;
