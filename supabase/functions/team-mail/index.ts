// Team work email (firstname@residentbookkeeper.com).
// A signed-in team member sends or replies from their own work address. Every message sent is
// saved in trb_inbox (direction 'out') so Nancy can see all client conversations in the portal.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://residentbookkeeper.com";
const DAILY_LIMIT = 40;          // messages a team member can send per 24 hours
const MAX_RECIPIENTS = 5;        // to + cc
const MAX_ATTACH_B64 = 7_000_000; // about 5 MB of files
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const list = (v: unknown) => (Array.isArray(v) ? v : String(v || "").split(/[,;]/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
const esc = (x: string) => x.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Please sign in again." }, 401);
    const uid = u.user.id;

    // Who is sending? A team member with a work address, or the owner/admin.
    const { data: prof } = await admin.from("profile").select("owner_id").order("updated_at", { ascending: false }).limit(1).single();
    const owner = prof!.owner_id as string;
    const { data: emp } = await admin.from("employees").select("id,name,work_email,access_level,status").eq("portal_user_id", uid).eq("status", "Active").maybeSingle();
    const isAdmin = uid === owner || emp?.access_level === "admin";
    const body = await req.json().catch(() => ({}));

    let fromAddr = "", fromName = "";
    if (isAdmin && body.from_mailbox) {
      const want = String(body.from_mailbox).toLowerCase();
      if (want === "info@residentbookkeeper.com") { fromAddr = want; fromName = "The Resident Bookkeeper"; }
      else {
        const { data: t } = await admin.from("employees").select("name,work_email").ilike("work_email", want).maybeSingle();
        if (!t) return json({ error: "That mailbox does not exist." }, 400);
        fromAddr = t.work_email.toLowerCase(); fromName = t.name;
      }
    } else if (emp?.work_email) { fromAddr = emp.work_email.toLowerCase(); fromName = emp.name; }
    else if (isAdmin) { fromAddr = "info@residentbookkeeper.com"; fromName = "The Resident Bookkeeper"; }
    else return json({ error: "Your work email has not been set up yet. Ask Nancy." }, 403);

    const to = list(body.to), cc = list(body.cc);
    const subject = String(body.subject || "").trim().slice(0, 300);
    const text = String(body.body || "").trim();
    if (!to.length) return json({ error: "Add who the email is to." }, 400);
    if (to.length + cc.length > MAX_RECIPIENTS) return json({ error: `At most ${MAX_RECIPIENTS} recipients per email.` }, 400);
    const bad = [...to, ...cc].find((e) => !EMAIL.test(e));
    if (bad) return json({ error: `This address does not look right: ${bad}` }, 400);
    if (!subject) return json({ error: "Add a subject." }, 400);
    if (text.length < 2) return json({ error: "Write the message." }, 400);
    if (text.length > 20000) return json({ error: "The message is too long." }, 400);

    // Daily limit for team members protects the domain from being marked as spam.
    if (!isAdmin) {
      const { count } = await admin.from("trb_inbox").select("id", { count: "exact", head: true }).eq("direction", "out").ilike("mailbox", fromAddr).gte("created_at", new Date(Date.now() - 864e5).toISOString());
      if ((count || 0) >= DAILY_LIMIT) return json({ error: `Daily limit of ${DAILY_LIMIT} emails reached. Ask Nancy if you need more.` }, 429);
    }

    // Replying? The original must be in a mailbox this person can see.
    let orig: any = null;
    if (body.reply_to_id) {
      const { data } = await admin.from("trb_inbox").select("id,mailbox,message_id,subject,client_id,lead_id").eq("id", String(body.reply_to_id)).maybeSingle();
      if (!data) return json({ error: "The email you are replying to was not found." }, 404);
      if (!isAdmin && String(data.mailbox || "").toLowerCase() !== fromAddr) return json({ error: "You can only reply to email in your own mailbox." }, 403);
      orig = data;
    }

    const attachments = (Array.isArray(body.attachments) ? body.attachments : []).filter((a: any) => a?.filename && a?.content).slice(0, 5)
      .map((a: any) => ({ filename: String(a.filename).slice(0, 150), content: String(a.content) }));
    if (attachments.reduce((n: number, a: any) => n + a.content.length, 0) > MAX_ATTACH_B64) return json({ error: "Attachments are too large (about 5 MB in total)." }, 400);

    let key = Deno.env.get("RESEND_API_KEY") || "";
    if (!key) { const { data } = await admin.from("trb_internal_secrets").select("value").eq("name", "resend_api_key").maybeSingle(); key = data?.value || ""; }
    if (!key) return json({ error: "Email is not connected." }, 500);

    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#14110E;max-width:640px">${esc(text).replace(/\n/g, "<br>")}<p style="margin-top:22px;color:#9A7426;font-size:12px;letter-spacing:.08em">THE RESIDENT BOOKKEEPER · ACCURATE RECORDS · SMARTER DECISIONS · STRONGER BUSINESS<br><a href="${SITE}" style="color:#9A7426">residentbookkeeper.com</a></p></div>`;
    const payload: Record<string, unknown> = { from: `${fromName} | The Resident Bookkeeper <${fromAddr}>`, to, reply_to: fromAddr, subject, text, html };
    if (cc.length) payload.cc = cc;
    if (attachments.length) payload.attachments = attachments;
    if (orig?.message_id && /^<.+>$/.test(orig.message_id)) payload.headers = { "In-Reply-To": orig.message_id, "References": orig.message_id };
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: `Email failed: ${out?.message || r.status}` }, 502);

    // Link to a client or lead when the recipient is one.
    const [{ data: cl }, { data: ld }] = await Promise.all([
      admin.from("clients").select("id").eq("owner_id", owner).in("email", to).limit(1),
      admin.from("leads").select("id").eq("owner_id", owner).in("email", to).limit(1),
    ]);
    const clientId = orig?.client_id || cl?.[0]?.id || null, leadId = clientId ? null : (orig?.lead_id || ld?.[0]?.id || null);
    await admin.from("trb_inbox").insert({
      owner_id: owner, direction: "out", message_id: `resend:${out.id}`, mailbox: fromAddr, from_email: fromAddr, from_name: fromName,
      to_email: to.join(", "), cc_emails: cc.length ? cc : null, subject, text_body: text, snippet: text.replace(/\s+/g, " ").slice(0, 240),
      received_at: new Date().toISOString(), category: clientId ? "client" : leadId ? "lead" : "other", priority: "normal", status: "read",
      client_id: clientId, lead_id: leadId, has_attachments: attachments.length > 0, attachment_names: attachments.map((a: any) => a.filename),
      employee_id: emp?.id || null, reply_to_id: orig?.id || null,
    });
    if (orig) await admin.from("trb_inbox").update({ status: "done" }).eq("id", orig.id);
    return json({ ok: true, id: out.id, from: fromAddr });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
