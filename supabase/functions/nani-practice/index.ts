// Nani answers the bookkeepers' document requests on the PRACTICE clients (Kemi's Kitchen), acting as the client.
// The held-back practice documents live in storage at client-files/practice-pack/heldback/. When a bookkeeper asks for one,
// Nani emails it to them, puts it in the client's files against the request, marks the request received, and tells Nancy.
// Called by a database trigger (header x-nani-token); no approval step.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "client-files", PACK = "practice-pack/heldback";
const NANCY = "theresidentbookkeeper@gmail.com";
const FROM = "Nani from The Resident Bookkeeper <info@residentbookkeeper.com>";
const SIGN = "\n\nBest regards\nNani\nRESIDENT BOOKKEEPER";
// What each held-back document answers. A request can match several.
const DOCS: [string, RegExp, string][] = [
  ["Bank statement 2025-07 Zenova 4417.pdf", /\bjul(y)?\b[\s\S]*\b(statement|bank)|\b(statement|bank)\b[\s\S]*\bjul(y)?\b|missing (bank )?statement|statement gap/, "bank_statement"],
  ["Asset purchase invoices 2025.pdf", /\basset|equipment|freezer|oven|generator|fixed asset|capital (purchase|expenditure)/, "receipt_or_invoice"],
  ["Moniepoint POS settlement reports 2025.pdf", /\bpos\b|moniepoint|settlement|card (sales|payments)|terminal/, "requested_document"],
  ["Payroll schedules 2025.xlsx", /payroll|salar|wage|payslip|staff (pay|cost|list)|employees? (list|schedule)/, "requested_document"],
  ["Stock count 31 Dec 2025.pdf", /stock|inventory/, "requested_document"],
  ["Supplier statements 2025 (Mile12 and Fresh Farms).pdf", /supplier|vendor statement|mile ?12|fresh farm|creditor/, "requested_document"],
  ["Tax and pension payment receipts 2025.pdf", /(tax|pension|paye|vat|remittance|nsitf)[\s\S]*(receipt|evidence|proof|payment)|(receipt|evidence|proof)[\s\S]*(tax|pension|paye|vat|remit)/, "receipt_or_invoice"],
  ["Tenancy agreement summary.pdf", /tenan|\brent\b|lease|landlord|premises/, "requested_document"],
  ["WHT credit notes from Greenfield 2025.pdf", /\bwht\b|withholding|credit note|greenfield/, "requested_document"],
  ["Zenova loan offer letter and repayment schedule.pdf", /\bloan|repayment schedule|borrow|facility letter|offer letter/, "requested_document"],
];
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!, { auth: { persistSession: false } });
  const { data: sec } = await admin.from("trb_internal_secrets").select("name,value").in("name", ["nani_practice_token", "resend_api_key"]);
  const S = Object.fromEntries((sec || []).map((r: any) => [r.name, r.value]));
  if (!S.nani_practice_token || req.headers.get("x-nani-token") !== S.nani_practice_token) return json({ error: "Not allowed." }, 401);
  const body = await req.json().catch(() => ({}));
  const mail = async (to: string, subject: string, text: string, attachments: any[] = []) => {
    if (!S.resend_api_key || !to) return;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${S.resend_api_key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to: [to], reply_to: "info@residentbookkeeper.com", subject, text, attachments }) });
    if (!r.ok) throw new Error(`Email to ${to} failed: ${r.status} ${await r.text()}`);
  };

  // One-off: copy the held-back folder into storage.
  if (body.action === "load") {
    const base = String(body.source || "");
    const idx = (await (await fetch(base + "/index.txt")).text()).trim().split("\n").map((l) => l.split("|"));
    const done: string[] = [];
    for (const [blob, name] of idx) {
      const bytes = new Uint8Array(await (await fetch(base + "/" + blob)).arrayBuffer());
      const up = await admin.storage.from(BUCKET).upload(`${PACK}/${name}`, bytes, { upsert: true, contentType: name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf" });
      done.push(`${name}: ${up.error ? up.error.message : bytes.length + " bytes"}`);
    }
    return json({ ok: true, done });
  }

  const { data: r } = await admin.from("client_document_requests").select("*").eq("id", String(body.request_id || "")).single();
  if (!r) return json({ error: "Request not found." }, 404);
  const { data: c } = await admin.from("clients").select("id,name").eq("id", r.client_id).single();
  if (!c || !/^PRACTICE/i.test(c.name)) return json({ skipped: "not a practice client" });
  const { data: emp } = await admin.from("employees").select("name,work_email,email").eq("portal_user_id", r.created_by).maybeSingle();
  const who = emp?.name || "the bookkeeper", first = who.split(" ")[0], to = emp?.work_email || emp?.email || "";
  const text = `${r.title} ${r.details || ""}`.toLowerCase();
  const hits = DOCS.filter(([, re]) => re.test(text));

  if (!hits.length) {
    if (!body.quiet) await mail(NANCY, `Practice request not answered: ${who} asked for "${r.title}"`,
      `Hello Nancy,\n\n${who} asked ${c.name} for:\n${r.title}${r.details ? "\n" + r.details : ""}\n\nNothing in the held-back folder matches this, so I have not sent anything and the request is still open. It may already be in Batch 1, or it may be something Kemi does not have. Tell me what to send, or reply to ${first} yourself.${SIGN}`);
    await admin.from("trb_ai_work_log").insert({ owner_id: r.owner_id, employee_id: "nani", job: "practice_request", status: "skipped", summary: `${who} asked for "${r.title}" on ${c.name}: no matching practice document.`, proof: { request_id: r.id } });
    return json({ ok: true, sent: [] });
  }

  const files: any[] = [];
  for (const [name, , category] of hits) {
    const dl = await admin.storage.from(BUCKET).download(`${PACK}/${name}`);
    if (!dl.data) throw new Error(`${name} is missing from the practice folder.`);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const path = `${c.id}/uploads/practice-2025/requested/${name}`;
    await admin.storage.from(BUCKET).upload(path, bytes, { upsert: true, contentType: dl.data.type || "application/octet-stream" });
    await admin.from("client_files").insert({ owner_id: r.owner_id, client_id: c.id, request_id: r.id, category, file_name: name, storage_path: path, note: `Sent by Nani for Kemi (practice client) in answer to "${r.title}".`, uploaded_by: null, uploader: "client" });
    files.push({ name, bytes });
  }
  await admin.from("client_document_requests").update({ status: "uploaded", updated_at: new Date().toISOString() }).eq("id", r.id);
  const list = files.map((f) => "- " + f.name).join("\n");
  if (!body.quiet) {
    await mail(to, `${r.title} - Kemi's Kitchen`,
      `Hello ${first},\n\nHere is what you asked Kemi's Kitchen for ("${r.title}"):\n${list}\n\nThe file${files.length > 1 ? "s are" : " is"} attached and also in the client's files in your workspace, and your request is marked received. As Kemi's Kitchen is a practice client, I answer these requests on Kemi's behalf.${SIGN}`,
      files.map((f) => ({ filename: f.name, content: b64(f.bytes) })));
    await mail(NANCY, `Practice document sent to ${who}: ${r.title}`,
      `Hello Nancy,\n\n${who} asked ${c.name} for:\n${r.title}${r.details ? "\n" + r.details : ""}\n\nI sent ${first} (${to}):\n${list}\n\nThe request is marked received.${SIGN}`);
  }
  await admin.from("trb_ai_work_log").insert({ owner_id: r.owner_id, employee_id: "nani", job: "practice_request", status: "done", summary: `Sent ${files.map((f) => f.name).join(", ")} to ${who} for "${r.title}" (${c.name}).`, proof: { request_id: r.id, files: files.map((f) => f.name) } });
  return json({ ok: true, sent: files.map((f) => f.name) });
});
