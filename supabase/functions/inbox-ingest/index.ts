// Receives a copy of each email sent to @residentbookkeeper.com from the Cloudflare email worker,
// sorts it (client, lead, money, security, notification, other) and stores it in trb_inbox.
// Gmail still receives the original: this is a working copy for the portal and the AI team.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime@2.4.4";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const FREE = /@(gmail|yahoo|ymail|hotmail|outlook|live|icloud|aol|proton|protonmail)\./i;
const SECURITY = /\b(otp|one[- ]time|verification code|security code|passcode|password|sign[- ]?in|log[- ]?in|2fa|two[- ]factor|verify your|confirm your (email|account))\b/i;
const MONEY = /\b(invoice|payment|paid|receipt|remittance|credit alert|debit alert|transfer|transaction|statement|withholding|vat|refund|payout)\b/i;
const NOREPLY = /(no-?reply|notifications?|newsletter|mailer|marketing|news@|updates@|digest)/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!, { auth: { persistSession: false } });
  const { data: tok } = await admin.from("trb_internal_secrets").select("value").eq("name", "inbox_token").maybeSingle();
  if (!tok?.value || req.headers.get("x-inbox-token") !== tok.value) return json({ error: "Not allowed." }, 401);
  try {
    // Raw email bytes from the worker; JSON {raw: "..."} is accepted for testing.
    const raw = (req.headers.get("content-type") || "").includes("application/json")
      ? new TextEncoder().encode(String((await req.json()).raw || ""))
      : new Uint8Array(await req.arrayBuffer());
    if (raw.length > 6 * 1024 * 1024) return json({ error: "Too large." }, 413);
    const mail: any = await PostalMime.parse(raw);
    const { data: prof } = await admin.from("profile").select("owner_id").order("updated_at", { ascending: false }).limit(1).single();
    const owner = prof!.owner_id;
    const fromEmail = String(mail.from?.address || req.headers.get("x-mail-from") || "").toLowerCase();
    const fromName = mail.from?.name || null;
    const subject = String(mail.subject || "(no subject)").slice(0, 500);
    const text = String(mail.text || String(mail.html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")).replace(/\n{3,}/g, "\n\n").trim();
    const hasUnsub = (mail.headers || []).some((h: any) => String(h.key).toLowerCase() === "list-unsubscribe");

    // Who is it from?
    const [{ data: clients }, { data: leads }] = await Promise.all([
      admin.from("clients").select("id,email").eq("owner_id", owner),
      admin.from("leads").select("id,email").eq("owner_id", owner).not("email", "is", null),
    ]);
    const domain = fromEmail.split("@")[1] || "";
    const client = (clients || []).find((c: any) => c.email && (c.email.toLowerCase() === fromEmail || (!FREE.test(c.email) && !FREE.test(fromEmail) && c.email.toLowerCase().split("@")[1] === domain)));
    const lead = client ? null : (leads || []).find((l: any) => String(l.email).toLowerCase() === fromEmail);

    let category = "other", priority = "normal";
    if (client) { category = "client"; priority = "high"; }
    else if (lead) { category = "lead"; priority = "high"; }
    else if (SECURITY.test(subject)) { category = "security"; priority = "normal"; }
    else if (MONEY.test(subject) || MONEY.test(text.slice(0, 600))) { category = "money"; }
    else if (hasUnsub || NOREPLY.test(fromEmail)) { category = "notification"; priority = "low"; }
    const secret = category === "security" || SECURITY.test(subject);

    const row = {
      owner_id: owner,
      message_id: String(mail.messageId || `${fromEmail}|${subject}|${mail.date || Date.now()}`).slice(0, 500),
      mailbox: (req.headers.get("x-mail-to") || "").toLowerCase() || null,
      from_email: fromEmail || null, from_name: fromName,
      subject,
      text_body: secret ? null : text.slice(0, 20000),
      snippet: secret ? "Security message (codes are not stored here; see Gmail)." : text.replace(/\s+/g, " ").slice(0, 240),
      received_at: mail.date ? new Date(mail.date).toISOString() : new Date().toISOString(),
      category, priority,
      client_id: client?.id || null, lead_id: lead?.id || null,
      has_attachments: (mail.attachments || []).length > 0,
      attachment_names: (mail.attachments || []).map((a: any) => a.filename || "attachment").slice(0, 20),
    };
    const { error } = await admin.from("trb_inbox").upsert(row, { onConflict: "owner_id,message_id", ignoreDuplicates: true });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, category });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
