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
  ["Asset purchase invoices 2025.pdf", /\basset|equipment|freezer|oven|cooker|generator|laptop|powerline|coolpoint|compuplus|fixed asset|capital (purchase|expenditure)/, "receipt_or_invoice"],
  ["Moniepoint POS settlement reports 2025.pdf", /moniepoint|settlement|\bpos (report|statement|summar|charge|fee|settle|sales report)|card (sales|payments)|terminal/, "requested_document"],
  ["Payroll schedules 2025.xlsx", /payroll|salar|wage|payslip|staff (pay|cost|list)|employees? (list|schedule)/, "requested_document"],
  ["Stock count 31 Dec 2025.pdf", /stock|inventory/, "requested_document"],
  ["Supplier statements 2025 (Mile12 and Fresh Farms).pdf", /supplier|vendor statement|mile ?12|fresh farm|creditor/, "requested_document"],
  ["Tax and pension payment receipts 2025.pdf", /(tax|pension|paye|vat|remittance|nsitf)[\s\S]*(receipt|evidence|proof|payment)|(receipt|evidence|proof)[\s\S]*(tax|pension|paye|vat|remit)/, "receipt_or_invoice"],
  ["Tenancy agreement summary.pdf", /tenan|\brent\b|\blease\b|landlord|premises/, "requested_document"],
  ["WHT credit notes from Greenfield 2025.pdf", /\bwht\b|withholding|credit note|greenfield/, "requested_document"],
  ["Zenova loan offer letter and repayment schedule.pdf", /\bloan|repayment schedule|borrow|facility letter|offer letter|3,?000,?000/, "requested_document"],
];
// 2026 (January to October) documents, released 27 Nov 2026. Used when a request mentions 2026.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct"];
function docs2026(text: string): [string, string][] {
  const months = MONTHS.map((m, i) => (new RegExp(`\\b${m}[a-z]*\\b|2026-${String(i + 1).padStart(2, "0")}|\\b${i + 1}/2026`).test(text) ? i + 1 : 0)).filter(Boolean);
  const pick = (fn: (m: string) => string) => (months.length ? months : MONTHS.map((_, i) => i + 1)).map((m) => fn(String(m).padStart(2, "0")));
  const out: [string, string][] = [];
  if (/statement|\bbank\b/.test(text) && !/supplier|vendor/.test(text)) pick((m) => `Bank statement 2026-${m} Zenova 4417.pdf`).forEach((n) => out.push([n, "bank_statement"]));
  if (/sales invoice|customer invoice|invoices? (issued|to customers)|(techbridge|brightstar|greenfield|lekki)[\s\S]{0,40}invoice/.test(text)) pick((m) => `Sales invoices 2026-${m}.pdf`).forEach((n) => out.push([n, "receipt_or_invoice"]));
  if (/cash ?book/.test(text)) out.push(["Kemi's own cash book 2026.xlsx", "requested_document"]);
  if (/moniepoint|settlement|\bpos\b/.test(text)) out.push(["Moniepoint POS settlement reports 2026.pdf", "requested_document"]);
  if (/payroll|salar|wage|payslip/.test(text)) out.push(["Payroll schedules 2026.xlsx", "requested_document"]);
  if (/(tax|pension|paye|vat|remittance|nsitf)[\s\S]*(receipt|evidence|proof|payment)|(receipt|evidence|proof)[\s\S]*(tax|pension|paye|vat|remit)/.test(text)) out.push(["Tax and pension payment receipts 2026.pdf", "receipt_or_invoice"]);
  if (/\bwht\b|withholding|credit note/.test(text)) out.push(["WHT credit notes from Greenfield 2026.pdf", "requested_document"]);
  if (/\basset|equipment|generator|laptop|freezer|oven|cooker|fixed asset/.test(text)) out.push(["Asset purchase invoices 2026.pdf", "receipt_or_invoice"]);
  return out;
}
// Kemi's answers (from the reviewer guide's Client answers sheet). "none" = Kemi doesn't have it; "send" also releases a document.
const TAXR = "Tax and pension payment receipts 2025.pdf";
const ANSWERS: { re: RegExp; reply: string; none?: boolean; send?: string }[] = [
  { re: /\bvat\b[\s\S]*(schedule|return|computation|working|analysis|listing|breakdown)|(schedule|return|computation|working)s?[\s\S]*\bvat\b/, none: true, send: TAXR,
    reply: "I don't have VAT computation schedules or VAT returns for 2025. I never prepared any workings. Each month I just paid what I thought was right from my sales, and the payment receipts are all I have (Tax and pension payment receipts 2025). Please work it out from my invoices and POS records." },
  { re: /(techbridge|brightstar|greenfield|lekki|customer|sales)[\s\S]{0,40}invoices?|invoices?[\s\S]{0,40}(techbridge|brightstar|lekki|issued to|to customers)/, none: true,
    reply: "Those are in the sales invoices I already sent you: one file for each month of 2025 (Sales invoices 2025-01 to 2025-12). Every invoice I issued is in there." },
  { re: /okafor|86,?000/, reply: "That was Mr Chidi Okafor paying in advance for his birthday party on 5 July. I sent him an invoice for July." },
  { re: /transfers? to kemi|150,?000|salary[\s\S]{0,20}kemi|drawings/, reply: "Those are for me, personal. I don't take a salary." },
  { re: /bright ?minds|montessori|school fees|350,?000/, reply: "That is my son's school fees. I paid it from the business account by mistake." },
  { re: /500,?000|(money|transfer|credit) from kemi|kemi adeyemi[\s\S]{0,30}(credit|paid in|deposit)/, reply: "I put my own money in when the account was a bit low." },
  { re: /3,?000,?000|zenova[\s\S]{0,30}(credit|14 mar)/, reply: "That is my loan. I've sent the offer letter." },
  { re: /duplicate|312,?800|refund/, reply: "The network failed and the money went twice. Mile12 sent it back in May." },
  { re: /powerline|coolpoint|compuplus/, reply: "Generator, the new gas cooker and a laptop. I've sent the invoices." },
  { re: /greenfield[\s\S]{0,60}(less|short|underpa|deduct|difference)|(less|short|underpa|deduct|difference)[\s\S]{0,60}greenfield/, reply: "They deduct tax. They give me credit notes. I've sent them." },
  { re: /opening balance|2,?162,?000|2,?150,?000/, reply: "I don't know. Use what the accountant gave." },
  { re: /128,?000|fresh farms?[\s\S]{0,40}(12|13|reversal|reversed|failed)/, reply: "The first transfer failed and the bank reversed it, so I sent it again." },
];
// What Kemi would answer or send for a piece of text.
function matchText(text: string) {
  const answers = ANSWERS.filter((a) => a.re.test(text));
  // A request about 2026 gets the 2026 files; the 2025 held-back files only if it also mentions 2025 (or no year).
  const y26 = /2026/.test(text), y25 = /2025/.test(text) || !y26;
  const names = new Set(y25 ? DOCS.filter(([, re]) => re.test(text)).map(([n]) => n) : []);
  if (y25) answers.forEach((a) => a.send && names.add(a.send));
  const hits: [string, any, string][] = [...DOCS.filter(([n]) => names.has(n)), ...(y26 ? docs2026(text).map(([n, c]) => [n, null, c] as [string, any, string]) : [])];
  return { answers, hits };
}
// The new part of an email: drop quoted replies and signatures.
function freshText(body: string) {
  const lines: string[] = [];
  for (const l of String(body || "").split(/\r?\n/)) {
    if (/^\s*>/.test(l) || /^On .+wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l)) break;
    lines.push(l);
  }
  return lines.join("\n").trim();
}
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

  // An email a team member sent to info@: Kemi questions become a practice request (answered by the flow below,
  // via the request trigger); anything else gets a short acknowledgement so nobody feels ignored.
  if (body.inbox_id) {
    const { data: m } = await admin.from("trb_inbox").select("*").eq("id", String(body.inbox_id)).single();
    if (!m || m.direction !== "in" || m.status === "done") return json({ skipped: "not a new email" });
    const from = String(m.from_email || "").toLowerCase();
    const { data: e } = await admin.from("employees").select("id,name,portal_user_id,work_email,email").or(`work_email.eq.${from},email.eq.${from}`).eq("status", "Active").not("work_email", "is", null).maybeSingle();
    if (!e) return json({ skipped: "not from the team" });
    const subject = String(m.subject || "").replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim();
    const fresh = freshText(m.text_body || m.snippet || "");
    if (fresh.length < 160 && /^(hi+|hello|dear)?[\s\S]{0,30}\b(thanks|thank you|noted|well received|ok|okay)\b/i.test(fresh.replace(/\s+/g, " "))) {
      await admin.from("trb_inbox").update({ status: "read" }).eq("id", m.id);
      return json({ skipped: "thank-you note" });
    }
    const efirst = String(e.name || "").split(" ")[0];
    const { data: pc } = await admin.from("clients").select("id,name,owner_id").ilike("name", `PRACTICE%(${String(e.work_email || e.name).split(/[@ ]/)[0]}%`).limit(1).maybeSingle();
    const ask = `${subject}\n${fresh}`.toLowerCase();
    const { answers: a1, hits: h1 } = matchText(ask);
    if (pc && (a1.length || h1.length || /kemi/.test(ask))) {
      await admin.from("trb_inbox").update({ status: "done" }).eq("id", m.id);
      await admin.from("client_document_requests").insert({ owner_id: pc.owner_id, client_id: pc.id, title: (subject || "Question for Kemi").slice(0, 190), details: `Sent by email to info@ on ${String(m.received_at || m.created_at).slice(0, 10)}:\n${fresh}`.slice(0, 2000), status: "requested", created_by: e.portal_user_id });
      return json({ ok: true, routed: "practice request" });
    }
    await mail(e.work_email || e.email, `Re: ${subject || "your email"}`,
      `Hello ${efirst},\n\nThank you for your email ("${subject || "no subject"}"). I've passed it to Nancy and she will get back to you.\n\nIf it is something you need from a client (a document, or an answer from Kemi on the practice client), please use "Ask the client for documents" in your workspace. That way it reaches the client straight away and you can see when it has been answered.${SIGN}`);
    await mail(NANCY, `${e.name} emailed info@: ${subject || "(no subject)"}`,
      `Hello Nancy,\n\n${e.name} sent this to info@ and it needs you:\n\n${fresh.slice(0, 3000)}\n\nI've told ${efirst} you will get back to them. Reply from info@ or from the portal Mail view.${SIGN}`);
    await admin.from("trb_ai_work_log").insert({ owner_id: m.owner_id, employee_id: "nani", job: "team_email", status: "done", summary: `Acknowledged ${e.name}'s email "${subject}" and passed it to Nancy.`, proof: { inbox_id: m.id } });
    return json({ ok: true, routed: "acknowledged" });
  }

  const { data: r } = await admin.from("client_document_requests").select("*").eq("id", String(body.request_id || "")).single();
  if (!r) return json({ error: "Request not found." }, 404);
  const { data: c } = await admin.from("clients").select("id,name").eq("id", r.client_id).single();
  if (!c || !/^PRACTICE/i.test(c.name)) return json({ skipped: "not a practice client" });
  const { data: emp } = await admin.from("employees").select("name,work_email,email").eq("portal_user_id", r.created_by).maybeSingle();
  const who = emp?.name || "the bookkeeper", first = who.split(" ")[0], to = emp?.work_email || emp?.email || "";
  const text = `${r.title} ${r.details || ""}`.toLowerCase();
  const { answers, hits } = matchText(text);

  if (!hits.length && !answers.length) {
    if (!body.quiet) await mail(to, `${r.title} - Kemi's Kitchen`,
      `Hello ${first},\n\nI passed your request ("${r.title}") to Kemi. I don't have an answer from her on this yet, so I've asked Nancy to look at it and she will get back to you.${SIGN}`);
    if (!body.quiet) await mail(NANCY, `Practice request not answered: ${who} asked for "${r.title}"`,
      `Hello Nancy,\n\n${who} asked ${c.name} for:\n${r.title}${r.details ? "\n" + r.details : ""}\n\nNothing in the held-back folder or Kemi's answers matches this, so I have not replied and the request is still open. Tell me what Kemi should say, or reply to ${first} yourself.${SIGN}`);
    await admin.from("trb_ai_work_log").insert({ owner_id: r.owner_id, employee_id: "nani", job: "practice_request", status: "skipped", summary: `${who} asked for "${r.title}" on ${c.name}: no matching practice document or answer.`, proof: { request_id: r.id } });
    return json({ ok: true, sent: [] });
  }

  const files: any[] = [];
  for (const [name, , category] of hits) {
    const dl = await admin.storage.from(BUCKET).download(`${PACK}/${name}`);
    if (!dl.data) throw new Error(`${name} is missing from the practice folder.`);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const path = `${c.id}/uploads/practice-${/2026/.test(name) ? "2026" : "2025"}/requested/${name}`;
    await admin.storage.from(BUCKET).upload(path, bytes, { upsert: true, contentType: dl.data.type || "application/octet-stream" });
    await admin.from("client_files").insert({ owner_id: r.owner_id, client_id: c.id, request_id: r.id, category, file_name: name, storage_path: path, note: `Sent by Nani for Kemi (practice client) in answer to "${r.title}".`, uploaded_by: null, uploader: "client" });
    files.push({ name, bytes });
  }
  // Received if a file went; otherwise closed (Kemi answered, or doesn't have it).
  await admin.from("client_document_requests").update({ status: files.length ? "uploaded" : "cancelled", updated_at: new Date().toISOString() }).eq("id", r.id);
  const list = files.map((f) => "- " + f.name).join("\n");
  const said = answers.map((a) => `"${a.reply}"`).join("\n\n");
  if (!body.quiet) {
    await mail(to, `${r.title} - Kemi's Kitchen`,
      `Hello ${first},\n\nI passed your request ("${r.title}") to Kemi.${said ? `\n\nKemi says:\n${said}` : ""}${files.length ? `\n\n${files.length > 1 ? "These are" : "This is"} attached and also in the client's files in your workspace:\n${list}` : ""}\n\nYour request is marked ${files.length ? "received" : "closed"}. As Kemi's Kitchen is a practice client, I answer these requests on Kemi's behalf.${SIGN}`,
      files.map((f) => ({ filename: f.name, content: b64(f.bytes) })));
    await mail(NANCY, `Practice request answered for ${who}: ${r.title}`,
      `Hello Nancy,\n\n${who} asked ${c.name} for:\n${r.title}${r.details ? "\n" + r.details : ""}\n\n${said ? `I replied as Kemi:\n${said}\n\n` : ""}${files.length ? `I sent ${first} (${to}):\n${list}\n\n` : ""}The request is marked ${files.length ? "received" : "closed"}.${SIGN}`);
  }
  await admin.from("trb_ai_work_log").insert({ owner_id: r.owner_id, employee_id: "nani", job: "practice_request", status: "done", summary: `Answered "${r.title}" for ${who} (${c.name})${files.length ? ": sent " + files.map((f) => f.name).join(", ") : ""}${answers.length ? ", with Kemi's reply" : ""}.`, proof: { request_id: r.id, files: files.map((f) => f.name), answers: answers.map((a) => a.reply) } });
  return json({ ok: true, sent: files.map((f) => f.name), answered: answers.length });
});
