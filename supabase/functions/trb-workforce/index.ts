// TRB AI team, running inside TRB's own system (not ChatGPT).
// Every job writes proof to trb_ai_work_log. Anything public (posts, outreach) goes to trb_approvals first.
//   zara  - daily market research (web search) + up to 5 real prospect businesses saved as leads
//   amara - one social post draft a day, built to earn views, likes and follows
//   maya  - first-message drafts for new leads, for approval
//   ada   - client follow-through: overdue invoices, late documents, onboarding, referrals (no AI key needed)
//   nani  - 7am brief for Nancy (works even without the AI key), emailed when email is connected
//   instructions - acts on instructions typed to any AI employee in the portal
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-sonnet-4-5";
const SITE = "https://residentbookkeeper.com";
const MARKETS = ["Nigeria", "United States", "United Kingdom", "Canada", "Australia"];
const SERVICES = "monthly bookkeeping and bank reconciliation, catch-up/clean-up bookkeeping, management accounts and financial reports, payroll support, and TRB Books Lite (an AI-run monthly bookkeeping plan for small Nigerian businesses: upload bank statements, get reports)";
// Approved price list (matches the website). Plans: Essentials up to 150 transactions/2 accounts; Growth up to 400/5; Premium up to 800/10; over that is a custom quote.
const PRICES = "APPROVED PRICES (quote only these; final price is confirmed in writing after a free Books Health Check). Nigeria: Books Lite ₦100,000 a year (2 accounts, 100 transactions a month); Essentials ₦150,000/month; Growth ₦300,000/month; Premium ₦550,000/month; Catch-up ₦100,000 per month of records; Clean-up from ₦250,000. United States: Essentials $299, Growth $499, Premium $849 a month; Catch-up $199 per month of records; Clean-up from $499. United Kingdom: Essentials £229, Growth £399, Premium £679 a month; Catch-up £159 per month; Clean-up from £399. Canada: Essentials C$399, Growth C$679, Premium C$1,149 a month; Catch-up C$269 per month; Clean-up from C$679. Australia: Essentials A$449, Growth A$749, Premium A$1,279 a month; Catch-up A$299 per month; Clean-up from A$749. Plan limits: Essentials up to 150 transactions and 2 bank or card accounts; Growth up to 400 and 5; Premium up to 800 and 10; above that is a custom quote. Never invent discounts or other prices.";
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
// Gemini (free tier) is used ONLY for Zara and Amara, which work from public information.
// Google's free tier terms say not to send sensitive, confidential or personal information, so no client data goes here.
function geminiKey() { return Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || ""; }
function useGemini() { return !Deno.env.get("ANTHROPIC_API_KEY") && !!geminiKey(); }
async function gemini(system: string, prompt: string, search = false, images: { mime: string; data: string }[] = []) {
  const key = geminiKey();
  if (!key) throw new NeedsKey("No AI key is set (ANTHROPIC_API_KEY or GEMINI_API_KEY).");
  const pick = Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest";
  // Free-tier models are often busy (503): try each model up to twice.
  const models = [pick, "gemini-3.5-flash-lite", pick, "gemini-3.5-flash-lite"];
  let last = "";
  for (const model of models) {
    const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text: prompt }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 8192 } };
    if (search) body.tools = [{ google_search: {} }];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(images.length ? 60000 : 45000) }).catch((e) => new Response(JSON.stringify({ error: { message: "timed out or unreachable: " + String(e) } }), { status: 503 }));
    const data = await res.json().catch(() => ({}));
    if (res.ok) return ((data?.candidates?.[0]?.content?.parts) || []).map((p: any) => p.text || "").join("\n");
    last = `Gemini error ${res.status}: ${data?.error?.message || "unknown"}`;
    if (![404, 429, 500, 503].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(last);
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
async function resendKey(admin: SupabaseClient): Promise<string | null> {
  const env = Deno.env.get("RESEND_API_KEY");
  if (env) return env;
  const { data } = await admin.from("trb_internal_secrets").select("value").eq("name", "resend_api_key").maybeSingle();
  return data?.value || null;
}
type Attachment = { filename: string; content: string };
const SENDER: Record<string, string> = { ada: "Ada", nani: "Nani", zara: "Zara", amara: "Amara", maya: "Maya", nora: "Nora" };
// All AI team emails go out from info@residentbookkeeper.com; replies come back to info@.
async function sendEmail(admin: SupabaseClient, msg: { to: string; subject: string; text: string; html?: string; from?: string; reply_to?: string; cc?: string[]; attachments?: Attachment[] }) {
  const key = await resendKey(admin);
  if (!key) throw new Error("Email is not connected yet (no Resend key).");
  const payload: Record<string, unknown> = { from: msg.from || "The Resident Bookkeeper <info@residentbookkeeper.com>", to: [msg.to], reply_to: msg.reply_to || "info@residentbookkeeper.com", subject: msg.subject, text: msg.text, html: msg.html };
  if (msg.cc?.length) payload.cc = msg.cc;
  if (msg.attachments?.length) payload.attachments = msg.attachments;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Email failed: ${r.status} ${out?.message || JSON.stringify(out)}`);
  return out?.id as string;
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
  let text: string;
  if (useGemini()) {
    try { text = await gemini(system.replace("Use web search.", "Use Google Search."), ask, true); }
    catch (e) {
      // Without live search Zara would have to guess businesses and contact details, so she waits instead.
      throw new NeedsKey(`Zara needs live web search. Google's free tier does not include it on this key (${(e as Error).message.slice(0, 80)}). She will run once the Anthropic key is added.`);
    }
  }
  else {
    const data = await claude({ max_tokens: 6000, system, messages: [{ role: "user", content: ask }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }] });
    text = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
  }
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

// ---------- Amara: the daily social content plan (3 posts a day, for approval) ----------
// Follows Nancy's content rules, checks the content history so nothing repeats, writes the comment answer for
// interactive posts, and writes one post a day around a Manus visual Nancy uploads in the portal.
const FORM = "https://forms.gle/vV5eb9sWSehEhiDi7";
const SOCIAL_RULES = `BRAND: The Resident Bookkeeper (TRB). Tagline: "Accurate Records. Smarter Decisions. Stronger Business." Positioning: a company that understands the money and record-keeping struggles business owners face and solves them strategically.
TONE AND LANGUAGE: warm, confident, plain English a busy small-business owner understands. No jargon without explaining it. Short lines, white space, a check-mark list (✔) or numbered steps (1️⃣ 2️⃣) where useful, 1 to 3 emojis. For Nigerian posts use local examples (naira ₦, POS, transfers, WhatsApp orders, market traders, boutiques, restaurants, construction). For international posts use local currency and examples (no naira, no POS). Never invent statistics, clients or testimonials; label example people "(an illustrative example)". General education only, no specific tax or legal advice.
EVERY POST must answer three things: what problem, feeling or need it addresses; how TRB helps (where it fits naturally, show the tax benefit too, e.g. "tax-ready records", "claim every allowable cost"); and what the audience should do next.
CALLS TO ACTION: vary them. Instagram cannot take links in captions: use "Send BOOKS by DM", "tap the link in our bio", "Call or WhatsApp 0802 600 0078", "Save this", "Tag a business owner", "Comment below". Facebook can: use the Free Books Health Check form ${FORM}, Books Lite sign-up https://residentbookkeeper.com/bookslite-start?utm_source=facebook&utm_medium=social&utm_campaign=bookslite, the website residentbookkeeper.com, or the phone number. Do not put "Free Books Health Check" in every post.
HASHTAGS: 5 to 7. Always #TheResidentBookkeeper and #Bookkeeping, then a mix such as #SmallBusiness #BusinessOwners #NigerianBusiness #SmallBusinessNigeria #CashFlow #TaxReady #BusinessHumour #BookkeepingQuiz (international posts: #SmallBusinessUK, #SmallBusinessUSA, #SmallBusinessCanada, #SmallBusinessAustralia as relevant).
CONTENT MIX over every 30 posts: 9 educational or storytelling, 4 humour or relatable, 4 interactive (polls, quizzes, true or false, questions), 3 inspirational or emotional, 3 behind the scenes, 3 reels or short tutorials, 2 brand awareness, 2 promotional or conversion. Rotate so followers never see the same kind of post two days running.
INTERACTIVE POSTS (quiz, poll, true or false, question) MUST come with comment_answer: the exact reply TRB posts in the comments, with the answer and a one-line explanation, plus when to post it (for example "Post at 9pm the same day"). For opinion polls and questions, write a warm reply that thanks people and gives a useful tip on the most likely answer.
PROMOTIONAL POSTS: a price or offer post every two days at 4pm, using only the approved prices: ${PRICES}
VISUALS: bright cream backgrounds only (no dark backgrounds), TRB colours cream, black, red and a touch of gold. Brand name and tagline only, no open-book icon, no corner badges. When people are shown, alternate men and women of different countries and ethnicities. For posts without a Manus visual, describe a simple text card that looks exactly like the Manus visuals without the picture: headline, 2 to 4 short lines, and a call-to-action button whose text varies (Get Started, Vote Now, Call Us Now, Learn More, Comment Below, Save This).
MARKETS: Nigeria first. From 19 November 2026 roughly one post in three speaks to the US, UK, Canada or Australia.`;
const MIX: Record<string, number> = { educational: 9, humour: 4, interactive: 4, inspirational: 3, behind_the_scenes: 3, reel_tutorial: 3, brand_awareness: 2, promotional: 2 };
const POST_SCHEMA = `{"posts":[{"title":"internal name, max 8 words","category":"one of: ${Object.keys(MIX).join(", ")}","format":"single_image | carousel | reel | story | poll | quiz","goal":"views | likes_and_saves | follows | enquiries","market":"Nigeria | International","hook":"first line that stops the scroll, max 14 words","caption_instagram":"full Instagram caption including the hook as the first line, Instagram-style call to action, then the hashtags","caption_facebook":"the same post adapted for Facebook (links allowed), then the hashtags","comment_answer":"required for interactive posts, else empty string","problem":"the problem, feeling or need","how_trb_helps":"one line","next_step":"what the audience should do","visual_brief":"for a Manus visual: one line on how the caption uses it; otherwise the text card: headline / lines / button text","slides_or_script":["carousel slide texts or reel shot list, if any"]}]}`;

async function aiJson(system: string, prompt: string, images: { mime: string; data: string }[] = []) {
  if (useGemini()) {
    const t = await gemini(system, prompt, false, images);
    return lastJson(t);
  }
  const content: any[] = images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.data } }));
  content.push({ type: "text", text: prompt });
  const data = await claude({ max_tokens: 6000, system, messages: [{ role: "user", content }] });
  return lastJson((data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n"));
}

async function amara(admin: SupabaseClient, owner: string, focus = "") {
  const lagosNow = new Date(Date.now() + 3600e3);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  // History: everything posted, scheduled or drafted (rejected drafts excluded).
  const { data: hist } = await admin.from("trb_social_posts").select("planned_for,created_at,category,format,hook,topic,status").eq("owner_id", owner).neq("status", "rejected").order("planned_for", { ascending: false, nullsFirst: false }).limit(120);
  const H = hist || [];
  // Pick the first day from tomorrow that has fewer than 3 posts planned.
  let day = "";
  const taken: string[] = [];
  for (let i = 1; i <= 21 && !day; i++) {
    const d = ymd(new Date(lagosNow.getTime() + i * 864e5));
    const onDay = H.filter((h: any) => h.planned_for && ymd(new Date(Date.parse(h.planned_for) + 3600e3)) === d);
    if (onDay.length < 3) { day = d; taken.push(...onDay.map((h: any) => new Date(Date.parse(h.planned_for) + 3600e3).toISOString().slice(11, 16))); }
  }
  if (!day) { const s = "The content plan is full for the next three weeks."; await log(admin, owner, "amara", "daily_post", "skipped", s); return s; }
  const lastPromo = H.find((h: any) => h.category === "promotional");
  const promoDue = !lastPromo || Date.parse(day + "T16:00:00+01:00") - Date.parse(lastPromo.planned_for || lastPromo.created_at) >= 2 * 864e5 - 3600e3;
  const n = Math.max(1, 3 - taken.length);
  let free = ["08:00", "13:00", "19:00"].filter((t) => !taken.includes(t));
  if (promoDue && !taken.includes("16:00")) free = [...free.slice(0, n - 1), "16:00"];
  const slots = free.slice(0, n).sort();
  // Mix: what is under-represented in the last 30 posts.
  const last30 = H.slice(0, 30);
  const need = Object.entries(MIX).map(([k, n]) => [k, n - last30.filter((h: any) => h.category === k).length] as [string, number]).sort((a, b) => b[1] - a[1]);
  const lastCats = H.slice(0, 3).map((h: any) => h.category);
  const wanted = need.map(([k]) => k).filter((k) => k !== "promotional" && !lastCats.includes(k));
  // A Manus visual waiting?
  const { data: vis } = await admin.from("trb_social_visuals").select("*").eq("owner_id", owner).eq("status", "new").order("created_at").limit(1).maybeSingle();
  const images: { mime: string; data: string }[] = [];
  if (vis) {
    const dl = await admin.storage.from("social-visuals").download(vis.storage_path);
    if (dl.data && dl.data.size < 15e6 && /^image\//.test(dl.data.type || "image/png")) {
      const buf = new Uint8Array(await dl.data.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      images.push({ mime: dl.data.type || "image/png", data: btoa(bin) });
    }
  }
  const plan = slots.map((t, i) => ({ time_lagos: t, category: t === "16:00" ? "promotional" : wanted[i] || need[0][0], uses_manus_visual: !!images.length && i === 0 }));
  const international = day >= "2026-11-19";
  // Extra rules Nancy can change without a code update (trb_growth_config.amara_rules).
  const { data: cfg } = await admin.from("trb_growth_config").select("amara_rules").eq("id", true).maybeSingle();
  const system = `You are Amara, Social Media & Growth Manager at The Resident Bookkeeper (Instagram @theresidentbookkeeper and Facebook). You write the daily posts Nancy approves and schedules.\n${SOCIAL_RULES}${cfg?.amara_rules ? "\nMORE RULES FROM NANCY:\n" + cfg.amara_rules : ""}`;
  const prompt = `Write the posts for ${day} (Lagos time). Today is ${ymd(lagosNow)}.
Slots and categories to fill: ${JSON.stringify(plan)}.
${images.length ? `The attached image is a Manus visual Nancy made for the first slot${vis?.note ? ` (her note: ${vis.note})` : ""}. Read the text and picture in it carefully and write that post around exactly what the visual says. Do not describe a new design for it; you may change its category to fit the visual.` : "No Manus visual is waiting, so every post needs a text-card visual_brief."}
${international ? "International phase is on: make one of these posts speak to the US, UK, Canada or Australia." : "Nigerian market only for now."}
${focus ? `Instruction from Nancy: ${focus}\n` : ""}DO NOT REPEAT these recent and planned posts (hooks and topics), and do not reuse their angle:
${H.slice(0, 80).map((h: any) => `- [${h.category}] ${h.hook}${h.topic ? " / " + h.topic : ""}`).join("\n")}
Reply with ONE fenced json block exactly in this shape, one entry per slot in the same order: ${POST_SCHEMA}`;
  const out = await aiJson(system, prompt, images);
  const posts = (out.posts || []).slice(0, plan.length);
  if (!posts.length) throw new Error("Amara's draft came back empty.");
  const made: string[] = [];
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i], slot = plan[i];
    for (const k of ["hook", "caption_instagram", "caption_facebook"]) if (!p[k]) throw new Error(`Post draft is missing "${k}".`);
    // Hashtags always on their own line at the end.
    const tidy = (t: string) => String(t).replace(/\s*((?:#[\p{L}\p{N}_]+[ \t]*)+)\s*$/u, "\n\n$1").trim();
    p.caption_instagram = tidy(p.caption_instagram); p.caption_facebook = tidy(p.caption_facebook);
    if (["interactive"].includes(p.category) && !p.comment_answer) p.comment_answer = "Thank everyone who answered, then share the answer and one useful tip.";
    const when = `${day}T${slot.time_lagos}:00+01:00`;
    const useVis = slot.uses_manus_visual && vis;
    const payload = { ...p, best_time_lagos: `${day} ${slot.time_lagos}`, planned_for: when, visual_id: useVis ? vis.id : null, storage_path: useVis ? vis.storage_path : null, visual_file: useVis ? vis.file_name : null };
    const { data: ap } = await admin.from("trb_approvals").insert({ owner_id: owner, employee_id: "amara", kind: "social_post", title: `${day.slice(5)} ${slot.time_lagos} · ${p.title || p.hook}`, body: p.caption_instagram, payload }).select("id").single();
    await admin.from("trb_social_posts").insert({ owner_id: owner, planned_for: when, category: p.category, format: p.format, hook: p.hook, topic: p.problem || p.title, caption_instagram: p.caption_instagram, caption_facebook: p.caption_facebook, comment_answer: p.comment_answer || null, visual_id: useVis ? vis.id : null, approval_id: ap?.id, source: "amara", status: "draft" });
    if (useVis) await admin.from("trb_social_visuals").update({ status: "used", used_by: ap?.id }).eq("id", vis.id);
    made.push(`${slot.time_lagos} ${p.category}${useVis ? " (Manus visual)" : ""}`);
  }
  const summary = `Drafted ${made.length} post(s) for ${day}: ${made.join(", ")}. Waiting for your approval.${vis ? "" : " No Manus visual was waiting: upload one in AI Workforce > Amara's studio."}`;
  await log(admin, owner, "amara", "daily_post", "done", summary, { day, posts: made });
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
Write a short, warm, specific first message from Nancy Bello, founder of The Resident Bookkeeper. Mention something specific about the lead. One clear next step (free 15-minute bookkeeping health check, or reply to chat). No pressure, no false claims, no prices unless asked; if price comes up, use only the approved prices below.\n${PRICES}
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


// ---------- Ada: clients after the sale (onboarding, payments, documents, referrals) ----------
// Works without the AI key: checks are rules, messages are written from templates and wait for approval.
async function ada(admin: SupabaseClient, owner: string, focus = "") {
  const d = today();
  const fmt = (v: number, c = "NGN") => { try { return new Intl.NumberFormat(c === "USD" ? "en-US" : "en-NG", { style: "currency", currency: c || "NGN", maximumFractionDigits: 2 }).format(Number(v || 0)); } catch { return `${c} ${v}`; } };
  const nice = (iso: string | null) => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
  const [{ data: clients }, { data: invoices }, { data: reqs }, { data: reports }, { data: recent }] = await Promise.all([
    admin.from("clients").select("id,name,contact_name,email,phone,status,created_at,access_type").eq("owner_id", owner).eq("status", "Active"),
    admin.from("invoices").select("id,number,amount,currency,status,due_date,issue_date,paid_date,client_id,bill_to").eq("owner_id", owner),
    admin.from("client_document_requests").select("id,client_id,title,status,due_date"),
    admin.from("client_reports").select("id,client_id"),
    admin.from("trb_approvals").select("payload,status,created_at").eq("employee_id", "ada").gte("created_at", new Date(Date.now() - 120 * 864e5).toISOString()),
  ]);
  const C = clients || [], I = invoices || [], Q = reqs || [], R = reports || [], P = recent || [];
  const done = (type: string, ref: string, days: number) => P.some((a: any) => a.payload?.type === type && a.payload?.ref === ref && a.status !== "rejected" && Date.parse(a.created_at) > Date.now() - days * 864e5);
  const byId = (id: string) => C.find((c: any) => c.id === id);
  const drafts: any[] = [], notes: string[] = [];
  const add = async (type: string, ref: string, c: any, title: string, body: string, extra: Record<string, unknown> = {}) => {
    const phone = c?.phone || null, email = c?.email || null;
    const channel = phone ? "whatsapp" : email ? "email" : "copy";
    const { data: ap } = await admin.from("trb_approvals").insert({ owner_id: owner, employee_id: "ada", kind: "other", title, body, payload: { type, ref, client_id: c?.id || null, client_name: c?.name || extra.name || null, channel, phone, email, subject: extra.subject || null, reason: extra.reason || null } }).select("id").single();
    drafts.push({ type, title, approval_id: ap?.id });
  };
  const hi = (c: any, b?: any) => `Hello ${(c?.contact_name || b?.contact || c?.name || b?.name || "there").split(" ")[0]},`;

  // 1. Overdue invoices: polite reminder (at most once a week per invoice)
  for (const inv of I.filter((i: any) => ["Sent", "Overdue"].includes(i.status) && i.due_date && i.due_date < d)) {
    if (done("payment_reminder", inv.id, 7)) continue;
    const c = byId(inv.client_id), b = inv.bill_to || {};
    await add("payment_reminder", inv.id, c || { name: b.name, email: b.email, phone: b.phone }, `Payment reminder: ${inv.number} (${b.name || c?.name || "client"})`,
      `${hi(c, b)} I hope you're well.\n\nA quick reminder that invoice ${inv.number} for ${fmt(inv.amount, inv.currency)} was due on ${nice(inv.due_date)}. The payment details are on the invoice${c?.access_type ? " and in your client portal" : ""}.\n\nIf you've already paid, thank you, and please send us the payment reference so we can match it.\n\nAda\nThe Resident Bookkeeper (TRB)`,
      { subject: `Reminder: invoice ${inv.number}`, reason: "Invoice is overdue", name: b.name });
  }
  // 2. Draft invoices nobody has sent yet (Nancy's to-do, no message)
  const drafty = I.filter((i: any) => i.status === "Draft" && i.issue_date && i.issue_date <= new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10));
  if (drafty.length) notes.push(`${drafty.length} invoice(s) still in Draft: ${drafty.map((i: any) => i.number).join(", ")}. Review and send them from Finance.`);
  // 3. Late document requests: gentle reminder (once a week)
  for (const r of Q.filter((x: any) => x.status === "requested" && x.due_date && x.due_date < d)) {
    if (done("document_reminder", r.id, 7)) continue;
    const c = byId(r.client_id); if (!c) continue;
    await add("document_reminder", r.id, c, `Document reminder: ${c.name}`,
      `${hi(c)} a gentle reminder that we're still waiting for: ${r.title} (it was due on ${nice(r.due_date)}).\n\nYou can upload it in your client portal at residentbookkeeper.com/platform, or send it to us on WhatsApp. Thank you!\n\nAda\nThe Resident Bookkeeper (TRB)`,
      { subject: `Still needed: ${r.title}`, reason: "Requested document is late" });
  }
  // 4. New clients with nothing started: ask for the first documents (once)
  const month = new Date(Date.now() - 30 * 864e5); const lastMonth = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  for (const c of C.filter((x: any) => x.access_type !== "bookslite" && Date.parse(x.created_at) > Date.now() - 45 * 864e5)) {
    if (Q.some((x: any) => x.client_id === c.id) || R.some((x: any) => x.client_id === c.id) || done("onboarding_start", c.id, 365)) continue;
    await add("onboarding_start", c.id, c, `Start onboarding: ${c.name}`,
      `${hi(c)} welcome again to The Resident Bookkeeper, we're glad to have you.\n\nTo get started, please send:\n1. Bank statements for ${lastMonth} for every business account (PDF or Excel)\n2. Sales invoices and receipts for the month\n3. Any bills or expenses you paid\n\nYou can upload them in your client portal at residentbookkeeper.com/platform or send them on WhatsApp. Once we have them, we'll take it from there.\n\nAda\nThe Resident Bookkeeper (TRB)`,
      { subject: "Getting started: what we need from you", reason: "New client with no documents requested yet" });
  }
  // 5. Happy, paying clients: ask for a referral (at most every 90 days)
  for (const c of C.filter((x: any) => Date.parse(x.created_at) < Date.now() - 60 * 864e5)) {
    const paid = I.filter((i: any) => i.client_id === c.id && i.status === "Paid");
    const owing = I.some((i: any) => i.client_id === c.id && ["Sent", "Overdue"].includes(i.status) && i.due_date && i.due_date < d);
    if (paid.length < 2 || owing || done("referral_ask", c.id, 90)) continue;
    await add("referral_ask", c.id, c, `Referral request: ${c.name}`,
      `${hi(c)} thank you for trusting us with your books. It means a lot.\n\nIf you know another business owner who could use the same support, I'd be grateful for an introduction. They can start with our free Books Health Check at residentbookkeeper.com.\n\nAda\nThe Resident Bookkeeper (TRB)`,
      { subject: "A small favour", reason: "Paying client for 2+ months with no overdue invoices" });
  }
  const summary = drafts.length || notes.length
    ? `Client review: ${drafts.length} message(s) drafted for your approval${notes.length ? "; " + notes.join(" ") : "."}`
    : "Client review: nothing needs attention.";
  await log(admin, owner, "ada", "client_review", drafts.length || notes.length ? "done" : "skipped", summary + (focus ? ` (Your note: ${focus.slice(0, 200)})` : ""), { drafts, notes, checked: { clients: C.length, invoices: I.length, requests: Q.length } });
  return summary;
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
    admin.from("sales_followups").select("id,title,due_at,status").eq("owner_id", owner).neq("status", "Sent").not("status", "ilike", "On hold%").not("status", "ilike", "Suppressed%").lte("due_at", new Date(Date.now() + 864e5).toISOString()),
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
  const key = await resendKey(admin), to = Deno.env.get("TRB_OWNER_EMAIL") || prof?.email;
  if (key && to) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("TRB_EMAIL_FROM") || "Nani | The Resident Bookkeeper <info@residentbookkeeper.com>", to: [to], subject: `Your TRB brief: ${needs.length ? needs.length + " thing(s) need you" : "all clear"}`, html, text }) });
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
      else if (ins.employee_id === "ada") r = await ada(admin, owner, ins.instruction);
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
    if (job === "ada") return await ada(admin, owner);
    if (job === "nani") return await nani(admin, owner, prof);
    if (job === "instructions") return await instructions(admin, owner, prof);
    if (job === "morning") { const r = []; for (const j of ["zara", "amara", "maya", "ada", "nani"]) r.push(await runJob(admin, j)); return r.join(" "); }
    return "Unknown job.";
  } catch (e) {
    const msg = (e as Error).message;
    await log(admin, owner, job === "instructions" ? "nani" : job, job, e instanceof NeedsKey ? "skipped" : "failed", msg);
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
    let isCron = false;
    let callerUserId: string | null = null;
    let allowed = false;
    if (cron) {
      const { data } = await admin.from("trb_internal_secrets").select("value").eq("name", "workforce_cron_token").maybeSingle();
      allowed = !!data?.value && data.value === cron;
      if (!allowed) return json({ error: "Invalid internal token." }, 401);
      isCron = true;
    } else {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
      const { data: u } = await caller.auth.getUser(token);
      if (!u?.user) return json({ error: "Invalid session." }, 401);
      callerUserId = u.user.id;
      const { data: tid } = await caller.rpc("trb_business_owner_id");
      allowed = !!tid;
      if (!allowed) return json({ error: "TRB team access is required." }, 403);
    }
    const body = await req.json().catch(() => ({}));
    if (body.action === "send_email") {
      // Nancy approved a drafted message: send it by email and close the approval.
      const { data: ap } = await admin.from("trb_approvals").select("*").eq("id", String(body.approval_id || "")).maybeSingle();
      if (!ap) return json({ error: "Draft not found." }, 404);
      const p = ap.payload || {};
      const to = String(body.to || p.email || "").trim();
      if (!/^\S+@\S+\.\S+$/.test(to)) return json({ error: "This draft has no email address. Add one or send it another way." }, 400);
      if (ap.kind === "outreach_message") {
        if (isCron || !callerUserId) return json({ error: "Cold prospect outreach is blocked for scheduled/background jobs. Use the authenticated owner send action." }, 403);
        if (body.owner_send_approved !== true || body.lawful_contact_basis_verified !== true) return json({ error: "Recipient-specific owner approval and lawful-contact confirmation are required." }, 403);
        const approvedEmail = String(p.email || "").trim().toLowerCase();
        if (!approvedEmail || to.toLowerCase() !== approvedEmail) return json({ error: "Recipient must exactly match the reviewed prospect record." }, 403);
      }
      const text = String(body.body || ap.body || "").trim();
      const subject = String(body.subject || p.subject || ap.title || "The Resident Bookkeeper").trim();
      const esc = (x: string) => x.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#14110E;max-width:620px">${esc(text).replace(/\n/g, "<br>")}<p style="margin-top:22px;color:#9A7426;font-size:12px;letter-spacing:.08em">ACCURATE RECORDS · SMARTER DECISIONS · STRONGER BUSINESS<br><a href="${SITE}" style="color:#9A7426">residentbookkeeper.com</a></p></div>`;
      try {
        const who = SENDER[String(ap.employee_id || "")];
        const from = who ? `${who} | The Resident Bookkeeper <info@residentbookkeeper.com>` : undefined;
        const ccIn = Array.isArray(body.cc) ? body.cc : (Array.isArray(p.cc) ? p.cc : []);
        const cc = ccIn.map((x: unknown) => String(x).trim()).filter((x: string) => /^\S+@\S+\.\S+$/.test(x)).slice(0, 5);
        const attachments = (Array.isArray(body.attachments) ? body.attachments : []).filter((a: any) => a?.filename && a?.content)
          .slice(0, 5).map((a: any) => ({ filename: String(a.filename), content: String(a.content) }));
        const id = await sendEmail(admin, { to, subject, text, html, from, cc, attachments });
        const sentAt = new Date().toISOString();
        const updatedPayload = ap.kind === "outreach_message"
          ? { ...p, owner_send_approved: true, lawful_contact_basis_verified: true, owner_send_approved_by: callerUserId, owner_send_approved_at: sentAt, sent_recipient: to }
          : p;
        await admin.from("trb_approvals").update({
          status: "done", body: text, decided_at: sentAt,
          decided_by: callerUserId || ap.decided_by || null,
          payload: updatedPayload,
          note: ap.kind === "outreach_message"
            ? "Owner explicitly confirmed this recipient/action in the send dialog and attested to lawful-contact review."
            : ap.note
        }).eq("id", ap.id);
        await log(admin, ap.owner_id, ap.employee_id || "nani", "email_sent", "done", `Email sent to ${to}${cc.length ? " (cc " + cc.join(", ") + ")" : ""}: "${subject}"${attachments.length ? " with " + attachments.map((a: Attachment) => a.filename).join(", ") : ""}.`, { approval_id: ap.id, resend_id: id });
        return json({ ok: true, id });
      } catch (e) { return json({ error: (e as Error).message }, 502); }
    }
    if (body.action !== "run") return json({ error: "Unknown action." }, 400);
    const job = String(body.job || "");
    // @ts-ignore provided by Supabase
    EdgeRuntime.waitUntil(runJob(admin, job).catch((e) => console.error(e)));
    return json({ ok: true, job, status: "started" }, 202);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
