// Amara's text cards. Every Amara post that has no Manus visual gets a designed card image
// (cream, TRB black / red / gold, brand name and tagline only), so each day's 3 or 4 posts all have a picture.
// Called by a database trigger when Amara drafts a post (header x-visuals-token), or {all_pending:true} to backfill.
// The card wording comes from Amara's visual brief; a free AI model only tidies it into headline / lines / button.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { renderCard } from "./cardpng.ts";
import { fixPhones } from "./card.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// Amara now writes the card text herself (payload.card); price cards are built from the approved price table.
const usable = (c: any) => c && typeof c === "object" && (c.style === "price" ? !!(c.plan && c.price) : !!c.headline && !/text card|background|layout|headline '/i.test(String(c.headline)));
async function cardSpec(p: any) {
  if (usable(p.card)) return p.card;
  const key = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_KEY");
  const brief = String(p.visual_brief || "");
  const prompt = `Turn this social media post into the text for its image card. Reply with ONLY JSON:
{"kicker":"2 or 3 word label in capitals such as QUICK TIP, QUIZ, TRUE OR FALSE, POLL, DID YOU KNOW, or empty","headline":"max 12 words","lines":["2 to 4 short lines, max 9 words each"],"button":"call-to-action button text, max 4 words","style":"checklist | steps | options"}
Use "options" for quizzes and polls (lines are the answer choices, never reveal the answer), "steps" for numbered how-tos, otherwise "checklist".
Use the designer's brief where it gives a headline, lines or button. Plain English, no hashtags, no emojis, no links.
Post format: ${p.format || ""}. Category: ${p.category || ""}.
Designer's brief: ${brief}
Hook: ${p.hook || ""}
Caption: ${String(p.caption_instagram || "").slice(0, 1500)}`;
  if (key) {
    for (const model of [Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest", "gemini-flash-latest"]) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: "application/json" } }), signal: AbortSignal.timeout(40000) });
        const d = await r.json();
        const t = (d?.candidates?.[0]?.content?.parts || []).map((x: any) => x.text || "").join("");
        const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
        if (j.headline) return j;
      } catch (e) { console.log("spec", model, String(e)); }
    }
  }
  // Fallback: "headline / line / line / button" from the brief, without breaking prices such as "£399/month",
  // and never using a design description ("Text card with bright cream background ...") as the headline.
  const clean = brief.replace(/\b(\d[\d,.]*)\s*\/\s*(month|year|mo)\b/gi, "$1 a $2");
  const quoted = [...clean.matchAll(/['‘“"]([^'’”"]{3,80})['’”"]/g)].map((m) => m[1]);
  const bits = clean.replace(/^.*?:\s*/, "").split(/\s*[\/|]\s*/).filter(Boolean);
  const descriptive = /text card|background|layout|font|colour|color/i;
  const headline = quoted.find((q) => !descriptive.test(q)) || (!descriptive.test(bits[0] || "") && bits[0]) || p.hook;
  const lines = bits.length > 2 && !descriptive.test(bits[0]) ? bits.slice(1, -1).slice(0, 4) : [];
  return { kicker: "", headline, lines, button: (lines.length && bits[bits.length - 1].replace(/^button:?\s*/i, "")) || "Learn More", style: /quiz|poll/i.test(p.format || "") ? "options" : "checklist" };
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!, { auth: { persistSession: false } });
  const { data: tok } = await admin.from("trb_internal_secrets").select("value").eq("name", "visuals_token").maybeSingle();
  if (!tok?.value || req.headers.get("x-visuals-token") !== tok.value) return json({ error: "Not allowed." }, 401);
  const body = await req.json().catch(() => ({}));
  // {action:"sign", paths:[...]} -> short-lived public links so Metricool can fetch the pictures.
  if (body.action === "sign") {
    const out: Record<string, string | null> = {};
    for (const path of (body.paths || []).slice(0, 50)) {
      const { data } = await admin.storage.from("social-visuals").createSignedUrl(String(path), Number(body.expires) || 7 * 86400);
      out[path] = data?.signedUrl || null;
    }
    return json({ ok: true, urls: out });
  }
  // {action:"publish", approval_ids:[...]} (or none = every approved post still to go out): copies each post's picture
  // into the public "social-public" bucket and saves payload.public_image_url, so Metricool can attach it.
  if (body.action === "publish") {
    let pq = admin.from("trb_approvals").select("id,payload").eq("kind", "social_post").eq("status", "approved");
    if (Array.isArray(body.approval_ids) && body.approval_ids.length) pq = pq.in("id", body.approval_ids.map(String));
    const { data: rows } = await pq;
    const out: Record<string, string | null> = {};
    for (const a of rows || []) {
      const p = a.payload || {};
      if (!p.storage_path) { out[a.id] = null; continue; }
      if (!body.approval_ids && p.planned_for && Date.parse(p.planned_for) < Date.now()) continue;
      const dl = await admin.storage.from("social-visuals").download(p.storage_path);
      if (!dl.data) { out[a.id] = null; continue; }
      const ext = (p.storage_path.match(/\.(png|jpe?g|webp)$/i)?.[1] || "png").toLowerCase();
      const dest = `posts/${String(p.best_time_lagos || "").replace(/[^0-9]/g, "").slice(0, 12)}-${String(a.id).slice(0, 8)}-${Date.now().toString(36)}.${ext}`;
      const up = await admin.storage.from("social-public").upload(dest, dl.data, { contentType: dl.data.type || `image/${ext === "jpg" ? "jpeg" : ext}`, upsert: true });
      if (up.error) { out[a.id] = null; continue; }
      const url = admin.storage.from("social-public").getPublicUrl(dest).data.publicUrl;
      await admin.from("trb_approvals").update({ payload: { ...p, public_image_url: url } }).eq("id", a.id);
      out[a.id] = url;
    }
    return json({ ok: true, urls: out });
  }
  let q = admin.from("trb_approvals").select("*").eq("kind", "social_post").eq("employee_id", "amara");
  // {rerender_ids:[...]} redraws the card of those posts even if they already have one (not Manus visuals).
  const force = Array.isArray(body.rerender_ids) && body.rerender_ids.length > 0;
  q = force ? q.in("id", body.rerender_ids.map(String)) : body.all_pending ? q.eq("status", "pending") : q.eq("id", String(body.approval_id || ""));
  const { data: aps } = await q;
  const done: string[] = [];
  for (const a of aps || []) {
    const p = a.payload || {};
    if (p.storage_path && !(force && p.visual_kind === "card")) continue;
    try {
      const spec = JSON.parse(fixPhones(JSON.stringify(await cardSpec(p))));
      const png = await renderCard(spec);
      const path = `cards/${String(p.best_time_lagos || a.created_at).replace(/[^0-9]/g, "").slice(0, 12)}-${String(a.id).slice(0, 8)}.png`;
      const up = await admin.storage.from("social-visuals").upload(path, png, { contentType: "image/png", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const { data: v } = await admin.from("trb_social_visuals").insert({ owner_id: a.owner_id, storage_path: path, file_name: `${String(p.title || p.hook || "card").slice(0, 50)}.png`, note: "Text card made by Amara.", status: "used", used_by: a.id }).select("id").single();
      await admin.from("trb_approvals").update({ payload: { ...p, card: spec, storage_path: path, visual_file: "Amara text card", visual_id: v?.id, visual_kind: "card" } }).eq("id", a.id);
      await admin.from("trb_social_posts").update({ visual_id: v?.id }).eq("approval_id", a.id);
      done.push(a.title);
    } catch (e) { console.log("card failed", a.id, (e as Error).message); }
  }
  return json({ ok: true, made: done });
});
