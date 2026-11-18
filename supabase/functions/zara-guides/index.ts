// zara-guides: Zara researches, writes and keeps up to date the guides on residentbookkeeper.com/guides.
//   action "write"     - pick a new question business owners ask, research it, write a guide, fact-check it, publish it.
//   action "review"    - re-check up to 2 guides not checked for 30 days against current sources; update them if facts changed.
//   action "answers"   - find real public questions (Quora, Nairaland, Reddit, LinkedIn...) and draft answers for Nancy to post herself.
//   action "unpublish" - (team only) take a guide off the website: { slug }.
//   action "restore"   - (team only) put back the previous version of a guide: { slug }.
// Publishing is automatic (Nancy's choice, 18 Nov 2026), so every guide must pass the checks in validate() first.
// Uses Tavily web search plus the free Gemini key. Only public information goes to the model; never client data.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://residentbookkeeper.com";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trb-cron", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const today = () => new Date().toISOString().slice(0, 10);

const FACTS = `About The Resident Bookkeeper (TRB), THERESIDENTBOOKKEEPER LTD, RC 9906291, Abuja, Nigeria. Remote bookkeeping for small and growing businesses worldwide; main markets Nigeria, US, UK, Canada, Australia; other countries quoted in US dollars.
Services: monthly bookkeeping, bank reconciliation, monthly reports, payroll support (PAYE in Nigeria), VAT and WHT tracking, catch-up and clean-up, multi-company reconciliation retainers, AP/AR support. TRB does NOT file tax returns, give tax or legal advice, audit, or move client money.
Official prices (use only these, never invent others): Nigeria: TRB Books Lite ₦100,000 a year (up to 100 transactions/month, 2 accounts; micro businesses, freelancers, content creators, influencers); Essentials ₦150,000/month (150 transactions, 2 accounts); Growth ₦300,000 (400, 5); Premium ₦550,000 (800, 10); Catch-up ₦100,000 per month of records; Clean-up from ₦250,000. US: $299/$499/$849, catch-up $199, clean-up from $499. UK: £229/£399/£679, catch-up £159, clean-up from £399. Canada: C$399/C$679/C$1,149, catch-up C$269, clean-up from C$679. Australia: A$449/A$749/A$1,279, catch-up A$299, clean-up from A$749.
Every client starts with a free Books Health Check.`;

const TOPICS = `Audience: owners of small and growing businesses, freelancers and creators, mainly in Nigeria, plus the US, UK, Canada, Australia and other countries.
Good topics: bookkeeping basics, tax records and deadlines, VAT, withholding tax, PAYE and payroll, small company tax rules, bank reconciliation, separating business and personal money, choosing accounting software, catch-up and clean-up, cash flow, financial statements explained, preparing for loans or investors, bookkeeping for specific industries (clinics, schools, construction, e-commerce, restaurants, NGOs), hiring a remote bookkeeper, bookkeeping rules for US/UK/Canada/Australia small businesses.`;

// ---------------- Gemini ----------------
function geminiKey() { return Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || ""; }
async function gemini(system: string, prompt: string, search = false, temperature = 0.4) {
  const key = geminiKey();
  if (!key) throw new Error("No GEMINI_API_KEY is set in Supabase Edge Function secrets.");
  const pick = Deno.env.get("GEMINI_GUIDES_MODEL") || Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest";
  const models = [pick, "gemini-3.5-flash-lite", pick, "gemini-3.5-flash-lite"];
  let last = "";
  for (const model of models) {
    const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature, maxOutputTokens: 16384, ...(search ? {} : { responseMimeType: "application/json" }) } };
    if (search) body.tools = [{ google_search: {} }];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) })
      .catch((e) => new Response(JSON.stringify({ error: { message: String(e) } }), { status: 503 }));
    const data = await res.json().catch(() => ({}));
    if (res.ok) return ((data?.candidates?.[0]?.content?.parts) || []).map((p: any) => p.text || "").join("\n");
    last = `Gemini error ${res.status}: ${data?.error?.message || "unknown"}`;
    if (![404, 429, 500, 503].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, res.status === 429 ? 20000 : 3000));
  }
  throw new Error(last);
}

// Web search through Tavily (the free Gemini key cannot search Google itself).
type Hit = { title: string; url: string; content: string; published?: string };
async function webSearch(query: string, opts: Record<string, unknown> = {}): Promise<Hit[]> {
  const key = Deno.env.get("TAVILY_API_KEY");
  if (!key) throw new Error("TAVILY_API_KEY is not set in Supabase Edge Function secrets.");
  const res = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, topic: "general", search_depth: "advanced", max_results: 6, include_answer: false, include_raw_content: false, ...opts }), signal: AbortSignal.timeout(30000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Search failed " + res.status + ": " + (data?.detail?.error || data?.detail || data?.message || "unknown"));
  return (data.results || []).map((r: any) => ({ title: String(r.title || ""), url: String(r.url || ""), content: String(r.content || "").slice(0, 1500), published: r.published_date || undefined }));
}
async function research(queries: string[], opts: Record<string, unknown> = {}) {
  const batches = await Promise.all(queries.slice(0, 4).map((q) => webSearch(q, opts).catch(() => [] as Hit[])));
  const seen = new Set<string>(); const hits: Hit[] = [];
  for (const b of batches) for (const h of b) if (h.url && !seen.has(h.url)) { seen.add(h.url); hits.push(h); }
  return hits.slice(0, 18);
}
const evidenceText = (hits: Hit[]) => hits.map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}${h.published ? "\nPublished: " + h.published : ""}\n${h.content}`).join("\n\n");
function lastJson(raw: string): any {
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  for (const c of [...fenced.reverse(), raw]) {
    const s = c.indexOf("{"), e = c.lastIndexOf("}");
    if (s >= 0 && e > s) { try { return JSON.parse(c.slice(s, e + 1)); } catch { /* try next */ } }
  }
  throw new Error("The model did not return valid JSON.");
}

// ---------------- checks before anything goes live ----------------
const ALLOWED = new Set(["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "b", "i", "table", "thead", "tbody", "tr", "th", "td", "a", "br"]);
function cleanHtml(h: string) {
  let s = String(h || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|iframe|object|embed|form|svg|img)[\s\S]*?<\/\1>/gi, "").replace(/<(img|input|meta|link)[^>]*>/gi, "");
  s = s.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (m, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return "";
    if (m.startsWith("</")) return `</${t}>`;
    if (t === "a") {
      const href = /href\s*=\s*"(https:\/\/[^"]+)"/i.exec(attrs)?.[1];
      return href ? `<a href="${href.replace(/"/g, "")}" rel="noopener">` : "<a>";
    }
    if (t === "ol" && /gsteps/.test(attrs)) return `<ol class="gsteps">`;
    if (t === "ul" && /ticks/.test(attrs)) return `<ul class="ticks">`;
    if (t === "td" && /class\s*=\s*"r"/.test(attrs)) return `<td class="r">`;
    return `<${t}>`;
  });
  // Tables scroll on phones.
  s = s.replace(/<table>/g, `<div class="tbl"><table>`).replace(/<\/table>/g, "</table></div>");
  return s.trim();
}
const plain = (s: unknown, n = 2000) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, n);
function slugify(s: string) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70); }

async function urlAlive(u: string) {
  try {
    const r = await fetch(u, { method: "GET", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; TRB-Zara/1.0; +https://residentbookkeeper.com)" }, signal: AbortSignal.timeout(12000) });
    return r.status < 400 || r.status === 403; // some official sites block bots but exist
  } catch { return false; }
}

async function confidentialNames(admin: SupabaseClient) {
  const names = new Set<string>();
  for (const t of ["clients", "leads"]) {
    const { data, error } = await admin.from(t).select("name").limit(2000);
    if (error) continue;
    for (const r of data || []) { const n = String((r as any).name || "").trim(); if (n.length >= 5) names.add(n.toLowerCase()); }
  }
  return names;
}

async function validate(admin: SupabaseClient, g: any, isNew: boolean) {
  const problems: string[] = [];
  const out: any = {
    slug: slugify(g.slug || g.title), title: plain(g.title, 140), seo_title: plain(g.seo_title || g.title, 90), description: plain(g.description, 300),
    answer: plain(g.answer, 1200), body_html: cleanHtml(g.body_html), topic: plain(g.topic, 120),
    faq: (Array.isArray(g.faq) ? g.faq : []).map((f: any) => ({ q: plain(f.q || f.question, 200), a: plain(f.a || f.answer, 900) })).filter((f: any) => f.q && f.a).slice(0, 5),
    sources: [] as { title: string; url: string }[],
  };
  if (out.title.length < 15) problems.push("title too short");
  if (out.description.length < 60) problems.push("description too short");
  if (out.answer.length < 150) problems.push("short answer too short");
  const words = plain(out.body_html, 100000).split(" ").length;
  if (words < 450) problems.push(`body too short (${words} words)`);
  if (words > 3000) problems.push(`body too long (${words} words)`);
  if ((out.body_html.match(/<h2>/g) || []).length < 3) problems.push("needs at least 3 sections");
  if (out.faq.length < 3) problems.push("needs 3 FAQs");
  const srcs = (Array.isArray(g.sources) ? g.sources : []).map((s: any) => ({ title: plain(s.title, 140), url: String(s.url || "").trim() }))
    .filter((s: any) => /^https:\/\/[^\s"<>]+$/.test(s.url) && !/vertexaisearch|google\.com\/search/.test(s.url));
  const seen = new Set<string>();
  for (const s of srcs) { if (seen.has(s.url) || out.sources.length >= 6) continue; seen.add(s.url); if (await urlAlive(s.url)) out.sources.push(s); }
  if (out.sources.length < 3) problems.push(`only ${out.sources.length} working source links (need 3)`);
  const all = (out.title + " " + out.answer + " " + plain(out.body_html, 100000) + " " + JSON.stringify(out.faq)).toLowerCase();
  for (const bad of ["guarantee", "we file your tax", "we will file", "legal advice from us", "100% accurate", "as an ai", "lorem ipsum"]) if (all.includes(bad)) problems.push(`banned phrase: ${bad}`);
  for (const n of await confidentialNames(admin)) if (n.length >= 6 && all.includes(n)) problems.push("mentions a client or lead by name");
  if (isNew) {
    const { data: ex } = await admin.from("trb_guides").select("id").eq("slug", out.slug).maybeSingle();
    if (ex) out.slug = (out.slug + "-" + today().slice(0, 7)).slice(0, 80);
  }
  return { guide: out, problems };
}

// ---------------- prompts ----------------
const SHAPE = `Return ONLY one JSON object:
{"topic": string, "slug": "short-url-words", "title": "the question, as a business owner would ask it", "seo_title": "under 65 characters", "description": "under 155 characters", "answer": "2-4 sentence direct answer that stands alone (no HTML)", "body_html": "HTML using only <h2>, <h3>, <p>, <ul class=\\"ticks\\">, <ol class=\\"gsteps\\">, <li>, <strong>, <table> with <thead>/<tbody>/<tr>/<th>/<td>. 700-1400 words, at least 4 <h2> sections, practical, with a checklist or table where useful. Use <ol class=\\"gsteps\\"> for numbered steps and <ul class=\\"ticks\\"> for bullet lists.", "faq": [{"q": "...", "a": "..."}] (exactly 3), "sources": [{"title": "...", "url": "https://..."}] (3 to 6 real, specific pages you used: official sites such as government, tax authority, laws, regulators or large professional firms; full direct URLs, never search links)}`;
const STYLE = `Write like Nancy Bello's team at The Resident Bookkeeper: plain English, short sentences, British spelling, warm and practical, no hype, no emojis, no em dashes. Start sections with the answer. Explain terms the first time (e.g. "bank reconciliation (matching your records to your bank statement)"). Where tax is involved, show how good records help with it, but never give personalised tax advice or claim TRB files tax. Only state a figure (rate, threshold, deadline, penalty) if it comes from a current source you cite; say which law or authority it comes from and the year. If sources disagree, leave the figure out. Mention TRB naturally at most twice, ending with how TRB can help and the free Books Health Check.`;

async function writeGuide(admin: SupabaseClient) {
  const { data: existing } = await admin.from("trb_guides").select("title,topic").order("published_at", { ascending: false }).limit(200);
  const list = (existing || []).map((g: any) => "- " + g.title).join("\n");
  // 1. Find what owners are asking now.
  const trendHits = await research([
    "small business owners Nigeria questions bookkeeping tax 2026",
    "Nigeria Revenue Service new guidance small businesses " + today().slice(0, 7),
    "small business bookkeeping common questions " + today().slice(0, 4),
  ], { search_depth: "basic", max_results: 5, time_range: "month" });
  const plan = lastJson(await gemini(`You are Zara, Research & Business Development Manager at The Resident Bookkeeper. You plan guides for ${SITE}/guides.\n${FACTS}`,
    `Today is ${today()}.\n${TOPICS}\nGuides already published (do not repeat or closely overlap these):\n${list || "- none"}\n\nRecent search results about what owners are dealing with:\n${evidenceText(trendHits)}\n\nChoose ONE useful new guide topic, phrased as the question an owner would ask. Prefer timely topics. Then write 3 web search queries that will find current, authoritative sources (laws, tax authority, government, regulators, big professional firms) to answer it. Return ONLY JSON: {"question": "...", "topic": "...", "queries": ["...", "...", "..."]}`, false, 0.7));
  // 2. Research it.
  const hits = await research(Array.isArray(plan.queries) ? plan.queries : [String(plan.question)]);
  if (hits.length < 3) throw new Error("Not enough search results to research: " + plan.question);
  const allowed = new Set(hits.map((h) => h.url));
  const system = `You are Zara, Research & Business Development Manager at The Resident Bookkeeper. You write guides for ${SITE}/guides that help business owners and get cited by Google and AI assistants.\n${FACTS}\n${STYLE}\nUse ONLY the numbered evidence supplied for facts and figures. Never invent sources; every source URL must be copied exactly from the evidence.`;
  let draft = lastJson(await gemini(system, `Today is ${today()}. Write the guide answering: ${plan.question}\n\nEvidence:\n${evidenceText(hits)}\n\n${SHAPE}`, false, 0.6));
  // 3. Independent fact-check against the same evidence.
  try {
    const c = lastJson(await gemini(`You are a strict fact-checker for a bookkeeping firm's website. Today is ${today()}. Compare every figure, rate, threshold, deadline, law name and claim in the guide with the evidence. Remove or correct anything the evidence does not support, keep the same JSON shape, and keep sources limited to URLs in the evidence.\n${STYLE}\n${FACTS}`,
      `Evidence:\n${evidenceText(hits)}\n\nGuide:\n${JSON.stringify(draft)}\n\nReturn ONLY the corrected JSON object (same keys), plus "corrections": [short notes].`, false, 0.2));
    if (c && c.title && c.body_html) draft = c;
  } catch { /* keep draft; validation still applies */ }
  draft.sources = (Array.isArray(draft.sources) ? draft.sources : []).filter((x: any) => allowed.has(String(x?.url || "").trim()));
  if (!draft.topic) draft.topic = plan.topic;
  const { guide, problems } = await validate(admin, draft, true);
  return { guide, problems, corrections: draft.corrections || [] };
}

async function reviewGuide(admin: SupabaseClient, g: any) {
  const q = lastJson(await gemini(`You help keep a bookkeeping firm's guides accurate.`, `Today is ${today()}. Write 3 web search queries that would find the current official rules, rates, thresholds and deadlines mentioned in this guide.\nTitle: ${g.title}\nText: ${plain(g.answer + " " + g.body_html, 4000)}\nReturn ONLY JSON: {"queries": ["...", "...", "..."]}`, false, 0.3));
  const hits = await research(Array.isArray(q.queries) ? q.queries : [g.title]);
  if (hits.length < 2) throw new Error("Not enough search results to check the guide");
  const allowed = new Set([...hits.map((h) => h.url), ...((g.sources || []) as any[]).map((x) => x.url)]);
  const r = lastJson(await gemini(`You are Zara at The Resident Bookkeeper, keeping ${SITE}/guides accurate. Today is ${today()}. Compare every figure, rate, threshold, deadline, law and claim in the guide with the current evidence. Only change something when the evidence clearly shows it is wrong or out of date.\n${STYLE}\n${FACTS}`,
    `Evidence:\n${evidenceText(hits)}\n\nGuide (JSON):\n${JSON.stringify({ title: g.title, seo_title: g.seo_title, description: g.description, answer: g.answer, body_html: g.body_html, faq: g.faq, sources: g.sources, slug: g.slug })}\n\nIf everything is still correct, return ONLY {"changed": false, "note": "what you checked"}.\nIf anything is wrong or out of date, return ONLY {"changed": true, "change_note": "plain summary of what changed and why", "guide": { full corrected guide with the same keys: title, seo_title, description, answer, body_html, faq, sources (existing sources plus any evidence URLs you relied on), slug (keep the same slug) }}. Keep everything that is still correct unchanged.`, false, 0.2));
  if (r.guide) r.guide.sources = (Array.isArray(r.guide.sources) ? r.guide.sources : []).filter((x: any) => allowed.has(String(x?.url || "").trim()));
  return r;
}

// ---------------- jobs ----------------
async function owner(admin: SupabaseClient) {
  const { data } = await admin.from("profile").select("owner_id").order("updated_at", { ascending: false }).limit(1).single();
  return data?.owner_id as string;
}
async function log(admin: SupabaseClient, ownerId: string, job: string, status: string, summary: string, proof: unknown = {}) {
  await admin.from("trb_ai_work_log").insert({ owner_id: ownerId, employee_id: "zara", job, status, summary, proof });
}

async function runWrite(admin: SupabaseClient) {
  const ownerId = await owner(admin);
  let attempt = 0, last: any = null;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await writeGuide(admin);
      last = r;
      if (r.problems.length) { await log(admin, ownerId, "guide_write", "failed", `Draft "${r.guide.title}" not published: ${r.problems.join("; ")}`, { attempt, problems: r.problems }); continue; }
      const row = { ...r.guide, status: "published", author: "The Resident Bookkeeper", written_by: "zara", published_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_checked_at: new Date().toISOString(), change_note: "First published" };
      const { data: ins, error } = await admin.from("trb_guides").insert(row).select("id,slug,title").single();
      if (error) throw error;
      const url = `${SITE}/guides/${ins.slug}`;
      await log(admin, ownerId, "guide_published", "done", `Published a new guide: "${ins.title}" ${url}`, { url, sources: r.guide.sources, corrections: r.corrections });
      await admin.from("ai_employee_tasks").insert({ employee_id: "amara", owner_id: ownerId, title: `Promote new guide: ${ins.title}`, description: `Zara published a new guide at ${url}. Make 2 posts from it over the next week (one educational card with the short answer, one interactive question), each linking to the guide with ?utm_source=facebook&utm_medium=social&utm_campaign=guides (instagram for Instagram). Follow the current content rules.`, category: "Content", priority: "Medium", status: "Queued" });
      return { ok: true, url, title: ins.title };
    } catch (e) {
      last = { error: String((e as Error).message || e) };
      await log(admin, ownerId, "guide_write", "failed", "Guide writing failed: " + last.error, {});
    }
  }
  return { ok: false, last };
}

async function runReview(admin: SupabaseClient) {
  const ownerId = await owner(admin);
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: due } = await admin.from("trb_guides").select("*").eq("status", "published").or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`).order("last_checked_at", { ascending: true, nullsFirst: true }).limit(2);
  const results: unknown[] = [];
  for (const g of due || []) {
    try {
      const r = await reviewGuide(admin, g);
      if (r.changed && r.guide) {
        const { guide, problems } = await validate(admin, { ...r.guide, slug: g.slug }, false);
        if (problems.length) {
          await admin.from("trb_guides").update({ last_checked_at: new Date().toISOString() }).eq("id", g.id);
          await log(admin, ownerId, "guide_review", "failed", `Update to "${g.title}" not applied: ${problems.join("; ")}. Suggested change: ${plain(r.change_note, 300)}`, { slug: g.slug });
          results.push({ slug: g.slug, applied: false, problems }); continue;
        }
        await admin.from("trb_guide_revisions").insert({ guide_id: g.id, snapshot: g, reason: plain(r.change_note, 500) });
        const { slug: _s, ...fields } = guide;
        await admin.from("trb_guides").update({ ...fields, updated_at: new Date().toISOString(), last_checked_at: new Date().toISOString(), change_note: plain(r.change_note, 500) }).eq("id", g.id);
        await log(admin, ownerId, "guide_updated", "done", `Updated "${g.title}": ${plain(r.change_note, 400)} ${SITE}/guides/${g.slug}`, { slug: g.slug });
        results.push({ slug: g.slug, applied: true });
      } else {
        await admin.from("trb_guides").update({ last_checked_at: new Date().toISOString() }).eq("id", g.id);
        await log(admin, ownerId, "guide_review", "done", `Checked "${g.title}": still correct. ${plain(r.note, 200)}`, { slug: g.slug });
        results.push({ slug: g.slug, applied: false, unchanged: true });
      }
    } catch (e) {
      await log(admin, ownerId, "guide_review", "failed", `Could not check "${g.title}": ${String((e as Error).message || e)}`, { slug: g.slug });
      results.push({ slug: g.slug, error: String(e) });
    }
  }
  return { ok: true, checked: results };
}

// Community answers: Zara finds real public questions business owners are asking (Quora, Nairaland, Reddit,
// LinkedIn, forums) and drafts answers for Nancy to post herself. Nothing is posted automatically.
async function runAnswers(admin: SupabaseClient) {
  const ownerId = await owner(admin);
  const { data: guides } = await admin.from("trb_guides").select("title,slug").eq("status", "published").limit(200);
  const guideList = (guides || []).map((g: any) => `- ${g.title}: ${SITE}/guides/${g.slug}`).join("\n");
  const { data: prev } = await admin.from("trb_approvals").select("payload").eq("owner_id", ownerId).contains("payload", { type: "community_answer" }).order("created_at", { ascending: false }).limit(300);
  const done = new Set((prev || []).map((r: any) => String(r.payload?.question_url || "")));
  const system = `You are Zara at The Resident Bookkeeper. You find public questions where business owners ask for help with bookkeeping, records, payroll, VAT or tax records, and draft helpful answers that Nancy Bello (founder, accountant with 15+ years' experience) will post herself under her own name.\n${FACTS}`;
  const hits = await research([
    "bookkeeping question small business Nigeria site:nairaland.com",
    "small business tax records bookkeeping question site:quora.com",
    "small business bookkeeping help question site:reddit.com",
    "PAYE VAT records question small business owner Nigeria forum",
  ], { search_depth: "basic", max_results: 6, time_range: "year" });
  const fresh = hits.filter((h) => !done.has(h.url));
  if (!fresh.length) throw new Error("No new public questions found in search results");
  const allowedQ = new Set(fresh.map((h) => h.url));
  const raw = await gemini(system, `Today is ${today()}. Below are search results from public sites. Pick up to 4 that are genuine questions from small business owners, freelancers or creators (Nigeria first) about bookkeeping, records, payroll, VAT or tax records, where a helpful answer would still be useful. Skip news articles, adverts and anything that is not a question.\n\nResults:\n${evidenceText(fresh)}\n\nFor each one draft an answer in Nancy's voice (first person): genuinely useful on its own (120-250 words), plain English, British spelling, no hype, no emojis, no em dashes; give the practical steps; never give personalised tax advice or claim TRB files tax; only state a figure if you are sure it is current and say which law it comes from. Disclose naturally that she runs a bookkeeping firm. Include at most one link, only where it truly helps, choosing from our guides:\n${guideList || "- none yet"}\nor ${SITE}. Respect each platform's self-promotion rules (on Reddit, usually no link).\n\nReturn ONLY JSON: {"items":[{"platform": "Quora", "question": "the question as asked", "question_url": "URL copied exactly from the results", "why": "why this is a good fit", "answer": "the drafted answer", "link_used": "url or empty"}]}`, false, 0.5);
  const items = (lastJson(raw).items || []).slice(0, 5);
  const saved: string[] = [], skipped: string[] = [];
  for (const it of items) {
    const qurl = String(it.question_url || "").trim();
    const answer = plain(it.answer, 3000), question = plain(it.question, 300);
    if (!allowedQ.has(qurl) || done.has(qurl)) { skipped.push(question + ": bad or repeated link"); continue; }
    if (answer.split(" ").length < 60 || !question) { skipped.push(question + ": answer too short"); continue; }
    if (!(await urlAlive(qurl))) { skipped.push(question + ": question page not reachable"); continue; }
    const platform = plain(it.platform, 40) || "Web";
    await admin.from("trb_approvals").insert({
      owner_id: ownerId, employee_id: "zara", kind: "other", status: "pending",
      title: `Answer on ${platform}: ${question}`.slice(0, 200),
      body: answer,
      payload: { type: "community_answer", channel: "manual", platform, question, question_url: qurl, why: plain(it.why, 300), link_used: String(it.link_used || ""), note: "Post this yourself from your own account, then mark it done. Edit freely; it is written in your voice." },
    });
    done.add(qurl); saved.push(`${platform}: ${question}`);
  }
  await log(admin, ownerId, "community_answers", saved.length ? "done" : "failed", saved.length ? `Drafted ${saved.length} answer(s) for you to post: ${saved.join(" | ")}` : `No usable questions found this time. ${skipped.join("; ")}`, { saved, skipped });
  return { ok: true, saved, skipped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!, { auth: { persistSession: false } });
  const cron = req.headers.get("x-trb-cron") || "";
  let team = false;
  if (cron) {
    const { data } = await admin.from("trb_internal_secrets").select("value").eq("name", "workforce_cron_token").maybeSingle();
    if (!data?.value || data.value !== cron) return json({ error: "Invalid internal token." }, 401);
  } else {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: u } = await caller.auth.getUser(token);
    if (!u?.user) return json({ error: "Invalid session." }, 401);
    const { data: tid } = await caller.rpc("trb_business_owner_id");
    if (!tid) return json({ error: "TRB team access is required." }, 403);
    team = true;
  }
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  if (action === "write" || action === "review" || action === "answers") {
    const job = action === "write" ? runWrite(admin) : action === "review" ? runReview(admin)
      : runAnswers(admin).catch(async (e) => { const o = await owner(admin); await log(admin, o, "community_answers", "failed", "Could not draft answers: " + String((e as Error)?.message || e)); return { ok: false }; });
    if (body.wait === true) return json(await job);
    // Research takes a few minutes: run in the background and answer at once.
    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(job.catch((e: unknown) => console.error(e)));
    return json({ ok: true, started: action });
  }
  if ((action === "unpublish" || action === "republish") && (team || cron)) {
    const { error } = await admin.from("trb_guides").update({ status: action === "unpublish" ? "unpublished" : "published", updated_at: new Date().toISOString() }).eq("slug", String(body.slug || ""));
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }
  if (action === "restore" && (team || cron)) {
    const { data: g } = await admin.from("trb_guides").select("id").eq("slug", String(body.slug || "")).maybeSingle();
    if (!g) return json({ error: "Guide not found." }, 404);
    const { data: rev } = await admin.from("trb_guide_revisions").select("snapshot").eq("guide_id", g.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!rev) return json({ error: "No earlier version." }, 404);
    const s = rev.snapshot as any;
    await admin.from("trb_guides").update({ title: s.title, seo_title: s.seo_title, description: s.description, answer: s.answer, body_html: s.body_html, faq: s.faq, sources: s.sources, updated_at: new Date().toISOString(), change_note: "Restored previous version" }).eq("id", g.id);
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
});
