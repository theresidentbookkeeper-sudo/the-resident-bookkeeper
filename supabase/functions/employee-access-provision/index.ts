import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SITE_ORIGIN="https://residentbookkeeper.com";
// Auth is by bearer token (no cookies), so any origin is safe here.
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method not allowed."},405);
 try{
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim(); if(!token)return json({error:"Authentication required."},401);
  const url=Deno.env.get("SUPABASE_URL"),publishable=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY");
  if(!url||!publishable||!secret)return json({error:"Supabase function configuration is incomplete."},500);
  const caller=createClient(url,publishable,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await caller.auth.getUser(token); if(authError||!authData.user)return json({error:"Invalid session."},401);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const callerId=authData.user.id,callerEmail=(authData.user.email||"").toLowerCase();
  const {data:owner}=await admin.from("profile").select("owner_id").eq("owner_id",callerId).maybeSingle();
  let businessOwnerId=owner?.owner_id||null,authorized=!!owner;
  if(!authorized){
    const {data:staff}=await admin.from("employees").select("id,owner_id,portal_user_id").eq("portal_user_id",callerId).eq("status","Active").eq("access_level","admin").maybeSingle();
    businessOwnerId=staff?.owner_id||null; authorized=!!staff;
  }
  if(!authorized&&callerEmail){
    const {data:staff}=await admin.from("employees").select("id,owner_id").ilike("email",callerEmail).eq("status","Active").eq("access_level","admin").maybeSingle();
    businessOwnerId=staff?.owner_id||null; authorized=!!staff;
  }
  if(!authorized)return json({error:"Only authorized TRB team members can onboard employees."},403);
  const body=await req.json(),name=String(body?.name||"").trim(),email=String(body?.email||"").trim().toLowerCase(),phone=String(body?.phone||"").trim(),role=String(body?.role||"").trim();
  const access_level=body?.access_level==="admin"?"admin":"staff",country=String(body?.country||"").trim()||null,specialty=String(body?.specialty||"").trim()||null,payout_currency=String(body?.payout_currency||"NGN").trim().toUpperCase().slice(0,3);
  const sp=Number(body?.share_pct),share_pct=Number.isFinite(sp)&&sp>=0&&sp<=100?sp:30;
  if(!name||!email||!role)return json({error:"name, email and role are required."},400);
  if(!/^\S+@\S+\.\S+$/.test(email))return json({error:"Enter a valid employee email address."},400);
  const {data:existingEmployee}=await admin.from("employees").select("id,portal_user_id").ilike("email",email).maybeSingle();
  let userId=existingEmployee?.portal_user_id||null,invited=false;
  if(!userId){
    const {data:existingUser}=await admin.auth.admin.getUserByEmail(email);
    if(existingUser?.user)userId=existingUser.user.id;
    else{
      const {data:invite,error}=await admin.auth.admin.inviteUserByEmail(email,{data:{name,trb_role:role,account_type:"team"},redirectTo:`${SITE_ORIGIN}/platform`});
      if(error||!invite?.user)return json({error:error?.message||"Could not send the employee invitation."},500);
      userId=invite.user.id;invited=true;
    }
  }
  if(!businessOwnerId)return json({error:"TRB business owner could not be resolved."},500);
  const payload:Record<string,unknown>={owner_id:businessOwnerId,name,role,phone:phone||null,email,status:"Active",portal_user_id:userId,country,specialty,share_pct,payout_currency};
  // a new person is staff unless made admin; re-inviting someone keeps their level unless one is sent
  if(!existingEmployee?.id||body?.access_level)payload.access_level=access_level;
  if(!existingEmployee?.id)payload.start_date=new Date().toISOString().slice(0,10);
  const result=existingEmployee?.id?await admin.from("employees").update(payload).eq("id",existingEmployee.id):await admin.from("employees").insert(payload);
  if(result.error)return json({error:"Employee record could not be saved: "+result.error.message},500);
  return json({ok:true,invited,user_id:userId,message:invited?"Employee invitation sent.":"Existing employee login linked."});
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Unexpected employee onboarding error."},500)}
});
