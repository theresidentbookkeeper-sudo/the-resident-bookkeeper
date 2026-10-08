import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
// Auth is by bearer token (no cookies), so any origin is safe here.
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const ROLE_BRIEFS:Record<string,string>={
 amara:"Own organic visibility, content, engagement and inbound demand. Produce practical content opportunities and engagement actions; do not publish without approval.",
 maya:"Own lead qualification, follow-up, conversion and approved quote progression. Prioritize high-intent prospects and Books Lite opportunities.",
 ada:"Own onboarding, handoffs, client experience, retention and referral opportunities. Remove operational friction that can prevent conversion or delivery.",
 zara:"Own organic market research and business-development opportunity discovery across Nigeria, United States, Canada, United Kingdom and Australia. Do not make public claims or commitments without approval.",
 nora:"Own Books Lite delivery quality and identify Books Lite demand, onboarding readiness and bookkeeping workload. Do not provide tax advice, file taxes or move money."
};
async function askClaude(apiKey:string,employee:string,context:any){
 const system=`You are ${employee}, an AI employee of The Resident Bookkeeper (TRB).\n${ROLE_BRIEFS[employee]||"Support the TRB growth engine."}\n\nTRB operating target: ${context?.target||10} NEW CLIENTS PER MONTH across Nigeria, United States, Canada, United Kingdom and Australia. Books Lite sales count toward the same target. The target is an operating goal, not a guarantee. Organic acquisition is the default: do not recommend paid advertising unless the Managing Director explicitly changes the rule.\n\nReturn concise JSON with exactly these keys: summary (string), next_actions (array of strings), blockers (array of strings), opportunities (array of strings). Keep recommendations specific, measurable and within your authority. Do not claim an action happened unless the supplied context proves it happened.`;
 const upstream=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:1100,system,messages:[{role:"user",content:JSON.stringify(context)}]})});
 if(!upstream.ok)throw new Error(`AI provider returned ${upstream.status}`);
 const data=await upstream.json(),txt=Array.isArray(data?.content)?data.content.map((x:any)=>x?.text||"").join("\n"):"",cleaned=txt.replace(/^\`\`\`json\s*/i,"").replace(/\`\`\`\s*$/i,"").trim();
 return JSON.parse(cleaned);
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method not allowed."},405);
 try{
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim(); if(!token)return json({error:"Authentication required."},401);
  const supabaseUrl=Deno.env.get("SUPABASE_URL"),publishableKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),apiKey=Deno.env.get("ANTHROPIC_API_KEY");
  if(!supabaseUrl||!publishableKey)return json({error:"Supabase function configuration is incomplete."},500);
  if(!apiKey)return json({error:"AI team is not configured yet. Add ANTHROPIC_API_KEY to Edge Function secrets."},503);
  const sb=createClient(supabaseUrl,publishableKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token); if(userError||!userData.user)return json({error:"Invalid session."},401);
  const uid=userData.user.id;
  const owner=await sb.from("profile").select("owner_id").eq("owner_id",uid).maybeSingle();
  let ownerId=owner.data?.owner_id||null;
  if(!ownerId){const emp=await sb.from("employees").select("owner_id,status").eq("portal_user_id",uid).eq("status","Active").maybeSingle();ownerId=emp.data?.owner_id||null;}
  if(!ownerId)return json({error:"TRB team access is required."},403);
  const [config,monthly,employees,leads,followups,clients]=await Promise.all([
   sb.from("trb_growth_config").select("*").eq("id",true).maybeSingle(),
   sb.from("trb_growth_monthly").select("*").eq("owner_id",ownerId).order("month_start",{ascending:false}).limit(1).maybeSingle(),
   sb.from("ai_employees").select("id,name,role,department,status,capabilities,authority").eq("status","Active").order("name"),
   sb.from("leads").select("id,name,business_type,country,source,stage,product_code,product_name,created_at").eq("owner_id",ownerId).order("created_at",{ascending:false}).limit(40),
   sb.from("sales_followups").select("id,lead_id,title,channel,due_at,status,created_at").eq("owner_id",ownerId).order("due_at",{ascending:true}).limit(40),
   sb.from("clients").select("id,name,country,status,access_type,product_code,created_at").eq("owner_id",ownerId).order("created_at",{ascending:false}).limit(40)
  ]);
  const errors=[config,monthly,employees,leads,followups,clients].filter(x=>x.error).map(x=>x.error?.message).filter(Boolean); if(errors.length)return json({error:errors.join(" | ")},500);
  const target=config.data?.monthly_client_target||100,markets=config.data?.target_markets||["Nigeria","United States","Canada","United Kingdom","Australia"];
  const context={target,markets,organic_only:config.data?.organic_only??true,monthly:monthly.data||{},recent_leads:leads.data||[],due_followups:followups.data||[],recent_clients:clients.data||[]};
  const results:any[]=[];
  for(const employee of (employees.data||[]).filter((x:any)=>ROLE_BRIEFS[x.id])){
   try{
    const report=await askClaude(apiKey,employee.id,{...context,employee:{id:employee.id,name:employee.name,role:employee.role,capabilities:employee.capabilities,authority:employee.authority}});
    const insert=await sb.from("trb_growth_reports").insert({owner_id:ownerId,report_date:new Date().toISOString().slice(0,10),period_type:"daily",employee_id:employee.id,report_title:`${employee.name} — AI growth report`,summary:report.summary,metrics:{target,current:monthly.data||{},employee:employee.id},blockers:report.blockers||[],next_actions:report.next_actions||[]}).select("id").single();
    if(insert.error)throw insert.error;
    for(const action of (report.next_actions||[]).slice(0,5)) await sb.from("trb_growth_actions").insert({owner_id:ownerId,employee_id:employee.id,action_type:"AI_RECOMMENDATION",channel:employee.id==="amara"?"Social":employee.id==="maya"?"Sales":employee.id==="zara"?"Research":employee.id==="ada"?"Operations":"Books Lite",status:"Ready",metadata:{target,markets},result_summary:action});
    results.push({employee:employee.name,report_id:insert.data.id,status:"completed"});
   }catch(e){results.push({employee:employee.name,status:"failed",error:e instanceof Error?e.message:"AI report failed"});}
  }
  const nani=await sb.from("trb_growth_reports").insert({owner_id:ownerId,report_date:new Date().toISOString().slice(0,10),period_type:"daily",employee_id:null,report_title:"Nani — Executive AI team report",summary:`The AI team reviewed the TRB organic acquisition target of ${target} new clients/month across ${markets.join(", ")}, including Books Lite. Review the individual reports and Ready actions below; no external publication or outreach is claimed as completed by this run.`,metrics:{target,markets,monthly:monthly.data||{},team_run:results},blockers:results.filter(x=>x.status==="failed").map(x=>`${x.employee}: ${x.error}`),next_actions:["Review Ready actions","Approve public content before publishing","Prioritize high-intent leads and due follow-ups","Monitor target attainment daily"]}).select("id").single();
  return json({ok:true,target,reports:results,nani_report_id:nani.data?.id||null});
 }catch(error){console.error(error);return json({error:error instanceof Error?error.message:"Unexpected growth engine error."},500)}
});
