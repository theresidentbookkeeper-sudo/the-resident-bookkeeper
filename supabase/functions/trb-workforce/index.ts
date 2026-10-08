// TRB AI team, running inside TRB's own system (not ChatGPT).
// Every job writes proof to trb_ai_work_log. Anything public (posts, outreach) goes to trb_approvals first.
//   zara  - daily market research (web search) + up to 5 real prospect businesses saved as leads
//   amara - one social post draft a day, built to earn views, likes and follows
//   maya  - first-message drafts for new leads, for approval
//   nani  - 7am brief for Nancy (works even without the AI key), emailed when email is connected
//   instructions - acts on instructions typed to any AI employee in the portal
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-sonnet-4-5";
const SITE = "https://residentbookkeeper.com";
const MARKETS = ["Nigeria", "United States", "United Kingdom", "Canada", "Australia"];
const SERVICES = "monthly bookkeeping and bank reconciliation, catch-up/clean-up bookkeeping, management accounts and financial reports, payroll support, and TRB Books Lite (an AI-run monthly bookkeeping plan for small Nigerian businesses: upload bank statements, get reports)";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trb-cron", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const today = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10); // Lagos date

class NeedsKey extends Error {}
async function claude(body: Record<string, unknown>) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new NeedsKey("The AI key (ANTHROPIC_API_KEY) is not set in Supabase Edge Function secrets yet.");
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: MODEL, ...body }) });
  const data = await res.json();
  if (!res.ok) throw new Error(`AI service error ${res.status}: ${data?.error?.message || "unknown"}`);
  return data;
}
async function claudeTool(system: string, text: string, tool: any, max_tokens = 4000) {
  const data = await claude({ max_tokens, system, tools: [tool], tool_choice: { type: "tool", name: tool.name }, messages: [{ role: "user", content: text }] });
  const use = (data.content || []).find((c: any) => c.type === "tool_use");
  if (!use) throw new Error("AI did not return a structured answer.");
  return use.input;
}
function lastJson(text: string) {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  for (const b of blocks.reverse()) { try { return JSON.parse(b); } catch { /* next */ } }
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  return JSON.parse(text.slice(i, j + 1));
}

async function ownerId(admin: SupabaseClient) {
  const { data } = await admin.from("profile").select("owner_id,email,business_name").order("updated_at", { ascending: false }).limit(1).single();
  return data;
}
async function log(admin: SupabaseClient, owner: string, employee_id: string, job: string, status: string, summary: string, proof: unknown = {}) {
  await admin.from("trb_ai_work_log").insert({ owner_id: owner, employee_id, job, status, summary, proof });
}
async function config(admin: SupabaseClient) {
  const { data } = await admin.from("trb_growth_config").select("monthly_client_target,target_markets,organic_only").eq("id", true).maybeSingle();
  return { target: data?.monthly_client_target || 10, markets: data?.target_markets || MARKETS };
}

// ---------- Zara: research + prospects ----------
async function zara(admin: SupabaseClient, owner: string, focus = "") {
  const { target, markets } = await config(admin);
  const { data: existing } = await admin.from("leads").select("name").eq("owner_id", owner).order("created_at", { ascending: false }).limit(300);
  const known = (existing || []).map((l: any) => String(l.name || "").toLowerCase()).filter(Boolean);
  const system = `You are Zara, Research & Business Development Manager at The Resident Bookkeeper (TRB), a remote bookkeeping firm (${SITE}).
TRB sells: ${SERVICES}. Markets: ${markets.join(", ")}. Target: ${target} new clients a month, organic only (no paid ads).
Today is ${today()}. Use web search. Be factual: every item must come from a page you actually found, with its URL. Never invent businesses, people, emails or phone numbers.`;
  const ask = `${focus ? `Instruction from Nancy: ${focus}\n\n` : ""}Do today's research and reply with ONE fenced json block:
{"opportunities":[{"market":"","headline":"","why_it_matters":"","angle_for_trb":"","source_url":""}],
 "prospects":[{"name":"","country":"","business_type":"","why_they_need_us":"","website":"","public_email":"","public_phone":"","source_url":""}],
 "content_ideas":["..."]}
Rules: 3 opportunities (deadlines, rule changes, programmes, events that create bookkeeping demand in our markets this month).
Up to 5 prospects: real small or growing BUSINESSES (not individuals) that plausibly need bookkeeping now (e.g. new SMEs, grant/competition participants, businesses hiring an accountant, MTD-affected UK sole traders' firms, Nigerian SMEs). Give public_email/public_phone ONLY if published on the business's own site or listing, else "". Skip these existing leads: ${known.slice(0, 120).join("; ") || "none"}.
3 content ideas for Amara's social posts based on the opportunities.`;
  const data = await claude({ max_tokens: 6000, system, messages: [{ role: "user", content: ask }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }] });
  const text = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
  const out = lastJson(text);
  const added: any[] = [];
  for (const p of (out.prospects || []).slice(0, 5)) {
    const name = String(p.name || "").trim();
    if (!name || known.includes(name.toLowerCase()) || !(p.website || p.source_url)) continue;
    const { data: lead, error } = await admin.from("leads").insert({
      owner_id: owner, name, business_type: p.business_type || null, country: p.country || null, source: "Zara research", stage: "Prospect",
      email: p.public_email || null, phone: p.public_phone || null,
      notes: `Why: ${p.why_they_need_us || ""}\nWebsite: ${p.website || ""}\nFound at: ${p.source_url || ""}\nAdded by Zara on ${today()}.`,
    }).select("id,name").single();
    if (!error && lead) { added.push({ id: lead.id, name: lead.name, url: p.website || p.source_url }); known.push(name.toLowerCase()); }
  }
  const summary = `Research done: ${(out.opportunities || []).length} opportunities, ${added.length} new prospect(s) saved as leads.`;
  await log(admin, owner, "zara", "daily_research", "done", summary, { opportunities: out.opportunities || [], content_ideas: out.content_ideas || [], prospects_added: added });
  return summary;
}

// ---------- Amara: one post a day, for approval ----------
async function amara(admin: SupabaseClient, owner: string, focus = "") {
  const { data: z } = await admin.from("trb_ai_work_log").select("proof,created_at").eq("employee_id", "zara").eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: recent } = await admin.from("trb_approvals").select("title,payload,status").eq("kind", "social_post").order("created_at", { ascending: false }).limit(10);
  const tool = {
    name: "social_post", description: "One ready-to-approve post for TRB's Instagram and Facebook.",
    input_schema: { type: "object", required: ["title", "format", "goal", "hook", "caption", "hashtags", "visual_brief", "best_time_lagos"], properties: {
      title: { type: "string", description: "Internal name, max 8 words" },
      format: { type: "string", enum: ["reel", "carousel", "single_image", "story"] },
      goal: { type: "string", enum: ["views", "likes_and_saves", "follows", "enquiries"] },
      hook: { type: "string", description: "First line / on-screen text that stops the scroll (max 12 words)" },
      caption: { type: "string", description: "Full caption with line breaks, value first, ends with a clear call to action" },
      hashtags: { type: "array", items: { type: "string" }, description: "5-8 relevant hashtags, mix of niche and local" },
      slides_or_script: { type: "array", items: { type: "string" }, description: "Carousel slide texts or reel shot-by-shot script" },
      visual_brief: { type: "string", description: "What the image/video should show, in TRB brand: cream, black, red, gold" },
      best_time_lagos: { type: "string" },
    } },
  };
  const system = `You are Amara, Social Media & Growth Manager at The Resident Bookkeeper (Instagram @theresidentbookkeeper, Facebook). Brand: premium, warm, expert; cream, black, red, touch of gold. Tagline: Accurate Records. Smarter Decisions. Stronger Business.
Audience: small business owners in Nigeria first, also US, UK, Canada, Australia. TRB sells: ${SERVICES}.
Write posts that grow an organic audience:
- Views: strong 3-second hook, reels and carousels over plain images, trend-aware but on-brand.
- Likes and saves: one genuinely useful money/bookkeeping tip a small business owner can use today; simple language; local examples (naira, POS, transfers).
- Follows: promise ongoing value ("Follow for one bookkeeping tip every weekday").
- Enquiries: soft CTA to DM "BOOKS" or book a free health check at ${SITE}.
Rotate formats and goals; never repeat a recent post. No tax or legal advice beyond general education; no claims you cannot back up.`;
  const ctx = { today: today(), zara_research: z?.proof || null, recent_posts: recent || [], instruction_from_nancy: focus || null };
  const p = await claudeTool(system, JSON.stringify(ctx), tool, 3000);
  const body = `${p.hook}\n\n${p.caption}\n\n${(p.hashtags || []).map((h: string) => (h.startsWith("#") ? h : "#" + h)).join(" ")}`;
  const { data: ap } = await admin.from("trb_approvals").insert({ owner_id: owner, employee_id: "amara", kind: "social_post", title: p.title, body, payload: p }).select("id").single();
  const summary = `Drafted today's ${p.format} ("${p.title}", goal: ${p.goal}). Waiting for your approval.`;
  await log(admin, owner, "amara", "daily_post", "done", summary, { approval_id: ap?.id, format: p.format, goal: p.goal });
  return summary;
}

// ---------- Maya: first messages for new leads ----------
async function maya(admin: SupabaseClient, owner: string, focus = "") {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const [{ data: leads }, { data: pend }, { data: fu }] = await Promise.all([
    admin.from("leads").select("*").eq("owner_id", owner).in("stage", ["New", "Prospect"]).gte("created_at", since).order("created_at", { ascending: false }).limit(30),
    admin.from("trb_approvals").select("payload").eq("kind", "outreach_message").in("status", ["pending", "approved", "done"]).limit(500),
    admin.from("sales_followups").select("lead_id,message,status").eq("owner_id", owner).limit(1000),
  ]);
  const drafted = new Set((pend || []).map((a: any) => a.payload?.lead_id).filter(Boolean));
  const messaged = new Set((fu || []).filter((f: any) => f.message || f.status === "Sent").map((f: any) => f.lead_id));
  const todo = (leads || []).filter((l: any) => !drafted.has(l.id) && !messaged.has(l.id)).slice(0, 8);
  if (!todo.length) { const s = "No new leads waiting for a first message."; await log(admin, owner, "maya", "first_messages", "skipped", s); return s; }
  const tool = { name: "message", description: "First outreach message for one lead.", input_schema: { type: "object", required: ["channel", "message"], properties: { channel: { type: "string", enum: ["whatsapp", "email", "instagram_dm", "linkedin"] }, subject: { type: "string" }, message: { type: "string" }, reason: { type: "string" } } } };
  const system = `You are Maya, Sales & Client Acquisition Manager at The Resident Bookkeeper (${SITE}). TRB sells: ${SERVICES}.
Write a short, warm, specific first message from Nancy Bello, founder of The Resident Bookkeeper. Mention something specific about the lead. One clear next step (free 15-minute bookkeeping health check, or reply to chat). No pressure, no false claims, no prices unless asked.
Website enquiries ("New" leads) asked us for help: reply to their enquiry. Zara's "Prospect" leads did not contact us: be respectful, explain why you are reaching out, and make it easy to say no.
Pick the channel: WhatsApp if a phone exists, else email if an email exists, else Instagram DM or LinkedIn.${focus ? `\nInstruction from Nancy: ${focus}` : ""}`;
  const done: any[] = [];
  for (const l of todo) {
    try {
      const m = await claudeTool(system, JSON.stringify({ name: l.name, business_type: l.business_type, country: l.country, source: l.source, stage: l.stage, notes: l.notes, has_phone: !!l.phone, has_email: !!l.email }), tool, 900);
      const { data: ap } = await admin.from("trb_approvals").insert({ owner_id: owner, employee_id: "maya", kind: "outreach_message", title: `${m.channel} to ${l.name}`, body: m.message, payload: { lead_id: l.id, lead_name: l.name, channel: m.channel, subject: m.subject || null, phone: l.phone, email: l.email, reason: m.reason || null } }).select("id").single();
      done.push({ lead: l.name, approval_id: ap?.id });
    } catch (e) { if (e instanceof NeedsKey) throw e; done.push({ lead: l.name, error: (e as Error).message }); }
  }
  const s = `Drafted ${done.filter((d) => d.approval_id).length} first message(s) for your approval.`;
  await log(admin, owner, "maya", "first_messages", "done", s, { drafts: done });
  return s;
}

// ---------- Nani: the 7am brief ----------
async function nani(admin: SupabaseClient, owner: string, prof: any) {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const monthStart = today().slice(0, 7) + "-01";
  const q = await Promise.all([
    admin.from("leads").select("id,name,source,stage,created_at").eq("owner_id", owner).gte("created_at", since),
    admin.from("clients").select("id,name,created_at,access_type").eq("owner_id", owner).gte("created_at", monthStart),
    admin.from("trb_approvals").select("id,employee_id,kind,title").eq("owner_id", owner).eq("status", "pending"),
    admin.from("trb_ai_work_log").select("employee_id,job,status,summary,created_at").eq("owner_id", owner).gte("created_at", since).order("created_at"),
    admin.from("books_lite_statement_uploads").select("id,status,file_name,business_id").in("status", ["review", "failed"]),
    admin.from("books_lite_reports").select("id").eq("status", "ready").gte("generated_at", since),
    admin.from("client_report_notes").select("id,client_id").eq("author_type", "client").eq("resolved", false),
    admin.from("client_reports").select("id,title").eq("status", "client_reviewed"),
    admin.from("client_document_requests").select("id,title,due_date,status").in("status", ["requested", "uploaded"]),
    admin.from("invoices").select("id,number,amount,due_date,status").eq("owner_id", owner).neq("status", "Paid"),
    admin.from("sales_followups").select("id,title,due_at,status").eq("owner_id", owner).neq("status", "Sent").lte("due_at", new Date(Date.now() + 864e5).toISOString()),
  ]);
  const [leads, newClients, approvals, work, blHeld, blReady, clientNotes, reviewed, reqs, invoices, followups] = q.map((x) => x.data || []);
  const { target } = await config(admin);
  const d = today();
  const overdueInv = invoices.filter((i: any) => i.due_date && i.due_date < d);
  const lateDocs = reqs.filter((r: any) => r.status === "requested" && r.due_date && r.due_date < d);
  const failed = work.filter((w: any) => w.status === "failed");
  const needs: string[] = [];
  if (approvals.length) needs.push(`${approvals.length} item(s) waiting for your approval (${approvals.filter((a: any) => a.kind === "social_post").length} post, ${approvals.filter((a: any) => a.kind === "outreach_message").length} messages).`);
  if (blHeld.length) needs.push(`${blHeld.length} Books Lite statement(s) held or failed — open Books Lite.`);
  if (reviewed.length) needs.push(`${reviewed.length} client report(s) reviewed and ready to finalise.`);
  if (clientNotes.length) needs.push(`${clientNotes.length} client note(s) waiting for a reply.`);
  if (reqs.filter((r: any) => r.status === "uploaded").length) needs.push(`${reqs.filter((r: any) => r.status === "uploaded").length} client upload(s) to check.`);
  if (followups.length) needs.push(`${followups.length} sales follow-up(s) due today.`);
  if (overdueInv.length) needs.push(`${overdueInv.length} overdue invoice(s).`);
  if (lateDocs.length) needs.push(`${lateDocs.length} client document request(s) are late.`);
  if (failed.length) needs.push(`${failed.length} AI job(s) failed: ${failed.map((f: any) => `${f.employee_id} (${f.summary})`).join("; ")}`);
  const doneLines = work.filter((w: any) => w.status === "done").map((w: any) => `${w.employee_id[0].toUpperCase() + w.employee_id.slice(1)}: ${w.summary}`);
  const data = { date: d, target, clients_this_month: newClients.length, new_leads: leads.length, approvals: approvals.length, needs, done: doneLines, books_lite_ready: blReady.length };
  let headline = `${newClients.length} of ${target} new clients this month · ${leads.length} new lead(s) in the last 24 hours · ${needs.length ? needs.length + " thing(s) need you" : "nothing needs you"}.`;
  let advice = "";
  try {
    const a = await claudeTool(`You are Nani, executive assistant to Nancy, founder of The Resident Bookkeeper. Write her morning brief priorities: honest, short, specific, no fluff, no invented facts.`, JSON.stringify(data), { name: "brief", description: "Morning priorities", input_schema: { type: "object", required: ["top3"], properties: { top3: { type: "array", items: { type: "string" }, description: "The three most valuable things Nancy should do today, each one line" } } } }, 600);
    advice = (a.top3 || []).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n");
  } catch (e) { if (!(e instanceof NeedsKey)) advice = ""; }
  const text = [`Good morning, Nancy. Here is your brief for ${d}.`, "", headline, "", "NEEDS YOU", ...(needs.length ? needs.map((n) => "• " + n) : ["• Nothing urgent."]), "", "DONE IN THE LAST 24 HOURS (with proof in the portal)", ...(doneLines.length ? doneLines.map((n) => "• " + n) : ["• No AI work recorded."]), ...(advice ? ["", "TODAY'S TOP 3", advice] : []), "", `Open the portal: ${SITE}/platform`].join("\n");
  const esc = (s: string) => s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));
  const li = (a: string[]) => a.map((x) => `<li style="margin:4px 0">${esc(x)}</li>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#14110E"><div style="border-top:6px solid #B8112B;padding:20px 0 6px"><b style="color:#A67C1E;letter-spacing:.12em;font-size:12px">THE RESIDENT BOOKKEEPER · NANI</b></div><h2 style="margin:6px 0">Good morning, Nancy</h2><p style="background:#F5EBD6;padding:12px 14px;border-radius:8px">${esc(headline)}</p><h3 style="color:#B8112B;font-size:14px;letter-spacing:.08em">NEEDS YOU</h3><ul>${needs.length ? li(needs) : "<li>Nothing urgent.</li>"}</ul><h3 style="font-size:14px;letter-spacing:.08em">DONE IN THE LAST 24 HOURS</h3><ul>${doneLines.length ? li(doneLines) : "<li>No AI work recorded.</li>"}</ul>${advice ? `<h3 style="font-size:14px;letter-spacing:.08em">TODAY'S TOP 3</h3><p style="white-space:pre-line">${esc(advice)}</p>` : ""}<p><a href="${SITE}/platform" style="display:inline-block;background:#B8112B;color:#fff;padding:11px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Open the portal</a></p></div>`;
  const { data: dig } = await admin.from("trb_daily_digest").upsert({ owner_id: owner, digest_date: d, headline, body_text: text, body_html: html, data }, { onConflict: "owner_id,digest_date" }).select("id").single();
  // Email
  let note = "Email not sent: no email service connected yet (RESEND_API_KEY).";
  const key = Deno.env.get("RESEND_API_KEY"), to = Deno.env.get("TRB_OWNER_EMAIL") || prof?.email;
  if (key && to) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("TRB_EMAIL_FROM") || "Nani at The Resident Bookkeeper <nani@residentbookkeeper.com>", to: [to], subject: `Your TRB brief: ${needs.length ? needs.length + " thing(s) need you" : "all clear"}`, html, text }) });
    note = r.ok ? `Emailed to ${to}.` : `Email failed: ${r.status} ${await r.text()}`;
    if (r.ok) await admin.from("trb_daily_digest").update({ emailed_at: new Date().toISOString() }).eq("id", dig?.id);
  }
  await admin.from("trb_daily_digest").update({ email_note: note }).eq("id", dig?.id);
  const s = `Morning brief written. ${note}`;
  await log(admin, owner, "nani", "morning_brief", "done", s, { digest_id: dig?.id, needs: needs.length });
  return s;
}

// ---------- Instructions typed in the portal ----------
async function instructions(admin: SupabaseClient, owner: string, prof: any) {
  const { data: list } = await admin.from("trb_ai_instructions").select("*").eq("status", "pending").order("created_at").limit(5);
  const out: string[] = [];
  for (const ins of list || []) {
    await admin.from("trb_ai_instructions").update({ status: "working" }).eq("id", ins.id);
    try {
      let r = "";
      if (ins.employee_id === "zara") r = await zara(admin, owner, ins.instruction);
      else if (ins.employee_id === "amara") r = await amara(admin, owner, ins.instruction);
      else if (ins.employee_id === "maya") r = await maya(admin, owner, ins.instruction);
      else if (ins.employee_id === "nani") r = await nani(admin, owner, prof);
      else r = "This employee takes instructions elsewhere: for Nora, open the Books Lite client and use Instruct Nora.";
      await admin.from("trb_ai_instructions").update({ status: "done", response: r, completed_at: new Date().toISOString() }).eq("id", ins.id);
      out.push(r);
    } catch (e) {
      await admin.from("trb_ai_instructions").update({ status: "failed", response: (e as Error).message, completed_at: new Date().toISOString() }).eq("id", ins.id);
    }
  }
  return out.join(" ") || "No pending instructions.";
}

async function runJob(admin: SupabaseClient, job: string) {
  const prof = await ownerId(admin);
  const owner = prof.owner_id;
  try {
    if (job === "zara") return await zara(admin, owner);
    if (job === "amara") return await amara(admin, owner);
    if (job === "maya") return await maya(admin, owner);
    if (job === "nani") return await nani(admin, owner, prof);
    if (job === "instructions") return await instructions(admin, owner, prof);
    if (job === "morning") { const r = []; for (const j of ["zara", "amara", "maya", "nani"]) r.push(await runJob(admin, j)); return r.join(" "); }
    return "Unknown job.";
  } catch (e) {
    const msg = (e as Error).message;
    await log(admin, owner, job === "instructions" ? "nani" : job, job, "failed", msg);
    return msg;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!, { auth: { persistSession: false } });
    const cron = req.headers.get("x-trb-cron") || "";
    let allowed = false;
    if (cron) {
      const { data } = await admin.from("trb_internal_secrets").select("value").eq("name", "workforce_cron_token").maybeSingle();
      allowed = !!data?.value && data.value === cron;
      if (!allowed) return json({ error: "Invalid internal token." }, 401);
    } else {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
      const { data: u } = await caller.auth.getUser(token);
      if (!u?.user) return json({ error: "Invalid session." }, 401);
      const { data: tid } = await caller.rpc("trb_business_owner_id");
      allowed = !!tid;
      if (!allowed) return json({ error: "TRB team access is required." }, 403);
    }
    const body = await req.json().catch(() => ({}));
    if (body.action !== "run") return json({ error: "Unknown action." }, 400);
    const job = String(body.job || "");
    // @ts-ignore provided by Supabase
    EdgeRuntime.waitUntil(runJob(admin, job).catch((e) => console.error(e)));
    return json({ ok: true, job, status: "started" }, 202);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
