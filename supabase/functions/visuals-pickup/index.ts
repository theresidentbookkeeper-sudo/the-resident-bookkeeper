// Picks up the visuals Cue (Nancy's Manus agent) saves in the Google Drive folder "Manus Visuals"
// and queues them for Amara (trb_social_visuals, status "new"), who writes the post around each one.
// The folder is shared "anyone with the link can view", so no Google login is needed.
// If a GOOGLE_API_KEY secret is set the official Drive API is used; otherwise the folder's public embed view.
// Runs hourly from pg_cron (header x-visuals-token). {action:"baseline"} marks what is already there as seen.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const FOLDER = "1bf1xIn-MPGAYNcZb-0Yi4ptgVKgikJfj";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const IMG = /\.(png|jpe?g|webp|gif)$/i;

async function listFolder(): Promise<{ id: string; name: string }[]> {
  const key = Deno.env.get("GOOGLE_API_KEY");
  if (key) {
    const q = encodeURIComponent(`'${FOLDER}' in parents and trashed=false and mimeType contains 'image/'`);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=200&key=${key}`);
    const d = await r.json();
    if (!r.ok) throw new Error(`Drive API ${r.status}: ${d?.error?.message || ""}`);
    return d.files || [];
  }
  const html = await (await fetch(`https://drive.google.com/embeddedfolderview?id=${FOLDER}#list`, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
  const out: { id: string; name: string }[] = [];
  const re = /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
  let m; while ((m = re.exec(html))) { const name = m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim(); if (IMG.test(name)) out.push({ id: m[1], name }); }
  if (!out.length && !/flip-entry/.test(html)) throw new Error("Could not read the Drive folder (is it still shared with 'anyone with the link'?).");
  return out;
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!, { auth: { persistSession: false } });
  const { data: tok } = await admin.from("trb_internal_secrets").select("value").eq("name", "visuals_token").maybeSingle();
  if (!tok?.value || req.headers.get("x-visuals-token") !== tok.value) return json({ error: "Not allowed." }, 401);
  const body = await req.json().catch(() => ({}));
  const { data: prof } = await admin.from("profile").select("owner_id").order("updated_at", { ascending: false }).limit(1).single();
  const owner = prof!.owner_id;
  try {
    const files = await listFolder();
    const { data: seen } = await admin.from("trb_social_visuals").select("storage_path").like("storage_path", "drive/%");
    const known = new Set((seen || []).map((s: any) => String(s.storage_path).split("/")[1]));
    const fresh = files.filter((f) => !known.has(f.id));
    if (body.action === "baseline") {
      if (fresh.length) await admin.from("trb_social_visuals").insert(fresh.map((f) => ({ owner_id: owner, storage_path: `drive/${f.id}/${f.name}`, file_name: f.name, note: "Already in the Drive folder before automatic pickup started.", status: "skipped" })));
      return json({ ok: true, in_folder: files.length, marked_seen: fresh.length });
    }
    const added: string[] = [];
    for (const f of fresh.slice(0, 10)) {
      const r = await fetch(`https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`, { headers: { "User-Agent": "Mozilla/5.0" } });
      const type = r.headers.get("content-type") || "";
      if (!r.ok || !type.startsWith("image/")) { console.log("skip", f.name, r.status, type); continue; }
      const bytes = new Uint8Array(await r.arrayBuffer());
      const path = `drive/${f.id}/${f.name}`;
      const up = await admin.storage.from("social-visuals").upload(path, bytes, { contentType: type, upsert: true });
      if (up.error) { console.log("upload", f.name, up.error.message); continue; }
      await admin.from("trb_social_visuals").insert({ owner_id: owner, storage_path: path, file_name: f.name, note: "From Cue (Google Drive: Manus Visuals).", status: "new" });
      added.push(f.name);
    }
    if (added.length) await admin.from("trb_ai_work_log").insert({ owner_id: owner, employee_id: "amara", job: "visuals_pickup", status: "done", summary: `Picked up ${added.length} new visual(s) from Cue's Drive folder: ${added.join(", ")}.`, proof: { files: added } });
    return json({ ok: true, in_folder: files.length, added });
  } catch (e) {
    await admin.from("trb_ai_work_log").insert({ owner_id: owner, employee_id: "amara", job: "visuals_pickup", status: "failed", summary: (e as Error).message.slice(0, 300), proof: {} });
    return json({ error: (e as Error).message }, 500);
  }
});
