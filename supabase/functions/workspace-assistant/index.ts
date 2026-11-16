// Nora, TRB's AI bookkeeper, helping the team in their workspace. Works only on the clients a team member is assigned to (admins: all).
//   reconcile: matches the team member's ledger/cash book (Excel/CSV) to the client's bank statements (no AI needed)
//   convert: client PDF bank statements -> one Excel workbook (no AI needed; checked against the running balance)
//   ask:     questions about a client's records (needs an AI key approved for client data)
//   review:  checks a report or files against TRB's month-end checklist before submission (same)
// Everything is logged in trb_assistant_log and the Audit page.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getDocumentProxy } from "npm:unpdf@0.12.1";
import * as XLSX from "npm:xlsx@0.18.5";
import { toLines, readStatement, pdfItems } from "./statement.ts";
import { readTable, reconcile } from "./recon.ts";

const BUCKET = "client-files";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
class NeedsKey extends Error {}

// Client data may only go to an AI service whose terms do not use it for training:
// Anthropic's API, or Gemini on a paid (billing-enabled) key, marked by GEMINI_PAID=true.
async function ai(system: string, user: string, maxTokens = 2500): Promise<string> {
  const ak = Deno.env.get("ANTHROPIC_API_KEY");
  if (ak) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": ak, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }) });
    const d = await r.json();
    if (!r.ok) throw new Error(`AI service error ${r.status}: ${d?.error?.message || "unknown"}`);
    return (d.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
  }
  const gk = Deno.env.get("GEMINI_API_KEY");
  if (gk && Deno.env.get("GEMINI_PAID") === "true") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest"}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": gk }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens * 2 } }) });
    const d = await r.json();
    if (!r.ok) throw new Error(`AI service error ${r.status}: ${d?.error?.message || "unknown"}`);
    return (d?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("\n");
  }
  throw new NeedsKey("Nora's questions and reviews switch on once Nancy adds the AI key. PDF to Excel and reconciliation already work.");
}

async function fileText(admin: SupabaseClient, path: string, name: string, limit = 20000): Promise<string> {
  const dl = await admin.storage.from(BUCKET).download(path);
  if (!dl.data) return `[${name}: could not be opened]`;
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const ext = name.toLowerCase().split(".").pop() || "";
  try {
    if (ext === "pdf") {
      const lines = toLines(await pdfItems(getDocumentProxy, bytes));
      return lines.map((l: any) => l.text).join("\n").slice(0, limit) || `[${name}: no text found, it may be a scanned image]`;
    }
    if (["xlsx", "xls", "csv"].includes(ext)) {
      const wb = XLSX.read(bytes, { type: "array" });
      return wb.SheetNames.map((s) => `--- Sheet: ${s} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[s], { blankrows: false })).join("\n").slice(0, limit);
    }
    if (["txt", "md"].includes(ext)) return new TextDecoder().decode(bytes).slice(0, limit);
  } catch (e) { return `[${name}: could not be read (${(e as Error).message})]`; }
  return `[${name}: this file type is not read by the assistant]`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: "Please sign in again." }, 401);
  const uid = u.user.id;
  const { data: prof } = await admin.from("profile").select("owner_id").order("updated_at", { ascending: false }).limit(1).single();
  const { data: emp } = await admin.from("employees").select("id,name,access_level,status").eq("portal_user_id", uid).eq("status", "Active").maybeSingle();
  const isAdmin = uid === prof?.owner_id || emp?.access_level === "admin";
  if (!emp && !isAdmin) return json({ error: "Nora works with the TRB team only." }, 403);
  const who = emp?.name || "Nancy";
  const today = new Date().toISOString().slice(0, 10);
  const allowed = async (clientId: string) => {
    if (!clientId) return false;
    if (isAdmin) return true;
    const { data } = await admin.from("client_assignments").select("id").eq("employee_id", emp!.id).eq("client_id", clientId).lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).limit(1);
    return !!data?.length;
  };
  const audit = (event: string, detail: string, ref = "") => admin.from("trb_audit_log").insert({ user_id: uid, email: u.user.email, name: who, kind: isAdmin ? "team" : "staff", event, area: "assistant", detail: detail.slice(0, 500), ref_id: ref.slice(0, 80) });
  const logRow = async (row: Record<string, unknown>) => {
    await admin.from("trb_ai_work_log").insert({ owner_id: prof!.owner_id, employee_id: "nora", job: `team_${row.action}`, status: "done", summary: `Helped ${who}: ${String(row.question || row.action).slice(0, 160)}`, proof: { client_id: row.client_id, files: row.files } });
    return admin.from("trb_assistant_log").insert({ user_id: uid, employee_id: emp?.id || null, name: who, ...row }).select("id").single();
  };

  try {
    const body = await req.json().catch(() => ({}));
    const clientId = String(body.client_id || "");
    if (!(await allowed(clientId))) return json({ error: "Nora can only work on clients assigned to you." }, 403);
    const { data: client } = await admin.from("clients").select("id,name,country,business_type,contact_name,access_type").eq("id", clientId).single();
    const fileIds: string[] = (Array.isArray(body.file_ids) ? body.file_ids : []).map(String).slice(0, 12);
    const reportFileIds: string[] = (Array.isArray(body.report_file_ids) ? body.report_file_ids : []).map(String).slice(0, 6);
    const [{ data: files }, { data: rfiles }] = await Promise.all([
      fileIds.length ? admin.from("client_files").select("id,client_id,file_name,storage_path,category,period_start").in("id", fileIds).eq("client_id", clientId) : Promise.resolve({ data: [] as any[] }),
      reportFileIds.length ? admin.from("client_report_files").select("id,client_id,file_name,storage_path,kind,version").in("id", reportFileIds).eq("client_id", clientId) : Promise.resolve({ data: [] as any[] }),
    ]);
    const chosen = [...(files || []), ...(rfiles || [])];

    // ---------- PDF bank statements -> Excel ----------
    if (body.action === "convert") {
      const pdfs = (files || []).filter((f: any) => /\.pdf$/i.test(f.file_name));
      if (!pdfs.length) return json({ error: "Choose one or more PDF bank statements." }, 400);
      const wb = XLSX.utils.book_new();
      const all: any[] = [], summary: any[] = [], problems: string[] = [];
      for (const f of pdfs) {
        const dl = await admin.storage.from(BUCKET).download(f.storage_path);
        if (!dl.data) { problems.push(`${f.file_name}: could not be opened.`); continue; }
        const r = readStatement(toLines(await pdfItems(getDocumentProxy, new Uint8Array(await dl.data.arrayBuffer()))));
        if (!r.tx.length) { problems.push(`${f.file_name}: no transaction lines found. It may be a scanned image or password-protected; ask the client for the original PDF or an Excel/CSV download.`); continue; }
        const rows = r.tx.map((t: any) => ({ Date: t.date, Description: t.description, "Money out": t.out || null, "Money in": t.in || null, Balance: t.balance, Check: t.check === "agrees" ? "OK" : "Check this line" }));
        let sheet = f.file_name.replace(/\.pdf$/i, "").replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31);
        while (wb.SheetNames.includes(sheet)) sheet = sheet.slice(0, 28) + "_" + wb.SheetNames.length;
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
        rows.forEach((x: any) => all.push({ Statement: f.file_name, ...x }));
        summary.push({ Statement: f.file_name, Lines: r.tx.length, "Lines agreeing with balance": r.agreeing, "Opening balance": r.opening, "Money in": r.totalIn, "Money out": r.totalOut, "Closing balance": r.closing, "Opening + in - out": r.expected, Balanced: r.balanced ? "YES" : "NO - check" });
        if (!r.balanced) problems.push(`${f.file_name}: opening + money in - money out does not equal the closing balance. Check the lines marked "Check this line".`);
      }
      if (!summary.length) return json({ error: problems.join(" ") || "Nothing could be converted." }, 422);
      const out = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(summary), "Summary");
      XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(all), "All transactions");
      for (const n of wb.SheetNames) XLSX.utils.book_append_sheet(out, wb.Sheets[n], n);
      const bytes = XLSX.write(out, { type: "array", bookType: "xlsx" });
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
      const name = `${(client?.name || "Client").replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 40)} statements converted ${stamp}.xlsx`;
      const path = `${clientId}/assistant/${stamp}-statements.xlsx`;
      const up = await admin.storage.from(BUCKET).upload(path, new Uint8Array(bytes), { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const { data: cf } = await admin.from("client_files").insert({ owner_id: prof!.owner_id, client_id: clientId, category: "converted", file_name: name, storage_path: path, note: `Converted by Nora for ${who} from ${summary.length} PDF statement(s).`, uploaded_by: uid, uploader: "assistant" }).select("id").single();
      const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 600, { download: name });
      const answer = summary.map((s: any) => `${s.Statement}: ${s.Lines} lines, ${s.Balanced === "YES" ? "balances" : "does NOT balance"}`).join("\n") + (problems.length ? "\n\nTo check:\n" + problems.join("\n") : "");
      await logRow({ client_id: clientId, action: "convert", question: `Convert ${pdfs.length} PDF(s)`, answer, files: pdfs.map((f: any) => f.file_name), output_file_id: cf?.id });
      await audit("convert", `${client?.name}: ${pdfs.length} PDF statement(s) to Excel`, cf?.id || "");
      return json({ ok: true, url: signed.data?.signedUrl, file_name: name, summary, problems });
    }


    // ---------- Bank reconciliation: ledger / cash book vs bank statements ----------
    if (body.action === "reconcile") {
      const isBank = (f: any) => /\.pdf$/i.test(f.file_name) || ["bank_statement", "converted"].includes(f.category);
      const bankFiles = (files || []).filter(isBank), bookFiles = (files || []).filter((f: any) => !isBank(f) && /\.(xlsx|xls|csv)$/i.test(f.file_name));
      if (!bankFiles.length || !bookFiles.length) return json({ error: "Tick the bank statement(s) AND your ledger or cash book (Excel or CSV) to reconcile." }, 400);
      const bank: any[] = [], books: any[] = [], notes: string[] = [];
      for (const f of bankFiles) {
        const dl = await admin.storage.from(BUCKET).download(f.storage_path); if (!dl.data) { notes.push(`${f.file_name}: could not be opened.`); continue; }
        const bytes = new Uint8Array(await dl.data.arrayBuffer());
        if (/\.pdf$/i.test(f.file_name)) {
          const r = readStatement(toLines(await pdfItems(getDocumentProxy, bytes)));
          if (!r.tx.length) { notes.push(`${f.file_name}: no transaction lines found (scanned or protected PDF?).`); continue; }
          r.tx.forEach((t: any) => bank.push({ date: t.date, desc: t.description, amount: +(t.in - t.out).toFixed(2), src: f.file_name }));
        } else {
          const wb = XLSX.read(bytes, { type: "array", cellDates: true });
          const name = wb.SheetNames.includes("All transactions") ? "All transactions" : wb.SheetNames[0];
          const t = readTable(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true }), name);
          if (!t?.lines.length) { notes.push(`${f.file_name}: no bank lines found.`); continue; }
          t.lines.forEach((l: any) => bank.push({ ...l, src: f.file_name }));
        }
      }
      for (const f of bookFiles) {
        const dl = await admin.storage.from(BUCKET).download(f.storage_path); if (!dl.data) { notes.push(`${f.file_name}: could not be opened.`); continue; }
        const wb = XLSX.read(new Uint8Array(await dl.data.arrayBuffer()), { type: "array", cellDates: true });
        let got = false;
        for (const name of wb.SheetNames) {
          const t = readTable(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true }), name);
          if (t?.lines.length) { t.lines.forEach((l: any) => books.push({ ...l, src: `${f.file_name} / ${name}` })); got = true; }
        }
        if (!got) notes.push(`${f.file_name}: I could not find a table with a Date column and amounts (Money in/out, Debit/Credit or Amount).`);
      }
      if (!bank.length || !books.length) return json({ error: notes.join(" ") || "Nothing to reconcile." }, 422);
      const r: any = reconcile(bank, books);
      const row = (x: any) => ({ Date: x.date, Description: x.desc, "Money in": x.amount > 0 ? x.amount : null, "Money out": x.amount < 0 ? -x.amount : null, Source: x.src || "" });
      const out = XLSX.utils.book_new();
      const summary = [
        ["Bank reconciliation by Nora", ""], ["Client", client?.name], ["Prepared for", who], ["Statement period", `${r.from} to ${r.to}`], ["", ""],
        ["", "Bank", "Books"], ["Money in", r.bankIn, r.booksIn], ["Money out", r.bankOut, r.booksOut], ["Net movement", r.bankNet, r.booksNet], ["Difference (bank - books)", +(r.bankNet - r.booksNet).toFixed(2)], ["", ""],
        ["Lines matched", r.matched.length], ["In the bank, missing from the books", r.bankOnly.length, +r.bankOnly.reduce((s: number, x: any) => s + x.amount, 0).toFixed(2)],
        ["In the books, not in the bank", r.booksOnly.length, +r.booksOnly.reduce((s: number, x: any) => s + x.amount, 0).toFixed(2)],
        ["Same transaction, different amount", r.pairs.length, +r.pairs.reduce((s: number, p: any) => s + p.diff, 0).toFixed(2)],
        ["Months in the books with no bank statement", r.gapMonths.join(", ") || "none", r.gapLines.length],
        ["Possible duplicates in the books", r.dups.length], ["Lines in suspense / uncategorised", r.suspense.length],
        ["Books outside the statement period", r.outside.length], ["", ""],
        ["How to read this", "Start with 'Different amount' (likely typing errors), then 'Bank only' (usually charges, transfers or income not yet recorded), then 'Books only' (uncleared cheques, deposits in transit, or entries that never happened)."],
        r.flipped ? ["Note", "Your file records money in as a credit, so I reversed the signs to compare."] : ["", ""],
      ];
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(summary), "Summary");
      XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(r.pairs.map((p: any) => ({ "Bank date": p.bank.date, "Bank description": p.bank.desc, "Bank amount": p.bank.amount, "Books date": p.books.date, "Books description": p.books.desc, "Books amount": p.books.amount, Difference: p.diff }))), "Different amount");
      XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(r.bankOnly.map(row)), "Bank only");
      XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(r.booksOnly.map(row)), "Books only");
      if (r.gapLines.length) XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(r.gapLines.map(row)), "No statement yet");
      if (r.dups.length) XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(r.dups.map(row)), "Possible duplicates");
      if (r.suspense.length) XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(r.suspense.map((x: any) => ({ ...row(x), Account: x.account }))), "Suspense");
      XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(r.matched.map((b: any) => ({ "Bank date": b.date, "Bank description": b.desc, Amount: b.amount, "Books date": b.m.date, "Books description": b.m.desc, "Days apart": b.days }))), "Matched");
      const bytes = XLSX.write(out, { type: "array", bookType: "xlsx" });
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
      const name = `Bank reconciliation by Nora ${r.from} to ${r.to} (${stamp}).xlsx`;
      const path = `${clientId}/assistant/${stamp}-reconciliation.xlsx`;
      const up = await admin.storage.from(BUCKET).upload(path, new Uint8Array(bytes), { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const { data: cf } = await admin.from("client_files").insert({ owner_id: prof!.owner_id, client_id: clientId, category: "converted", file_name: name, storage_path: path, note: `Bank reconciliation by Nora for ${who}.`, uploaded_by: uid, uploader: "assistant" }).select("id").single();
      const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 600, { download: name });
      const fmt = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const lines = [
        `Period ${r.from} to ${r.to}. ${r.matched.length} lines matched.`,
        `Bank net movement ${fmt(r.bankNet)}; books ${fmt(r.booksNet)}; difference ${fmt(r.bankNet - r.booksNet)}.`,
        r.pairs.length ? `${r.pairs.length} transaction(s) recorded with a different amount, e.g. ${r.pairs[0].bank.date}: bank ${fmt(r.pairs[0].bank.amount)}, books ${fmt(r.pairs[0].books.amount)}.` : "",
        `${r.bankOnly.length} bank line(s) missing from the books (${fmt(r.bankOnly.reduce((s: number, x: any) => s + x.amount, 0))}).`,
        `${r.booksOnly.length} book line(s) not in the bank (${fmt(r.booksOnly.reduce((s: number, x: any) => s + x.amount, 0))}).`,
        r.gapMonths.length ? `No bank statement for ${r.gapMonths.join(", ")}: ${r.gapLines.length} book line(s) cannot be checked yet. Ask the client for it.` : "",
        r.dups.length ? `${r.dups.length} possible duplicate(s) in the books.` : "",
        r.suspense.length ? `${r.suspense.length} line(s) in suspense or uncategorised.` : "",
        ...notes,
      ].filter(Boolean);
      await logRow({ client_id: clientId, action: "reconcile", question: `Reconcile ${bookFiles.map((f: any) => f.file_name).join(", ")} with ${bankFiles.length} bank file(s)`, answer: lines.join("\n"), files: [...bankFiles, ...bookFiles].map((f: any) => f.file_name), output_file_id: cf?.id });
      await audit("convert", `${client?.name}: bank reconciliation ${r.from} to ${r.to}`, cf?.id || "");
      return json({ ok: true, url: signed.data?.signedUrl, file_name: name, lines });
    }

    // ---------- Questions and reviews (AI) ----------
    if (body.action === "ask" || body.action === "review") {
      const question = String(body.question || "").trim().slice(0, 2000);
      if (body.action === "ask" && question.length < 3) return json({ error: "Type your question." }, 400);
      if (body.action === "review" && !chosen.length) return json({ error: "Choose the report file(s) to review." }, 400);
      const [{ data: reqs }, { data: flist }, { data: reps }, { data: hist }] = await Promise.all([
        admin.from("client_document_requests").select("title,status,due_date,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(30),
        admin.from("client_files").select("file_name,category,period_start,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(60),
        admin.from("client_reports").select("title,period_start,period_end,status,summary").eq("client_id", clientId).order("created_at", { ascending: false }).limit(12),
        admin.from("trb_assistant_log").select("action,question,answer").eq("user_id", uid).eq("client_id", clientId).in("action", ["ask", "review"]).order("created_at", { ascending: false }).limit(4),
      ]);
      const texts: string[] = [];
      let budget = 60000;
      for (const f of chosen) { const t = await fileText(admin, f.storage_path, f.file_name, Math.min(25000, budget)); budget -= t.length; texts.push(`=== FILE: ${f.file_name} ===\n${t}`); if (budget < 2000) break; }
      const context = `CLIENT: ${client?.name} (${client?.business_type || "business"}, ${client?.country || "Nigeria"})
DOCUMENT REQUESTS: ${(reqs || []).map((r: any) => `${r.title} [${r.status}${r.due_date ? ", due " + r.due_date : ""}]`).join("; ") || "none"}
FILES ON RECORD: ${(flist || []).map((f: any) => `${f.file_name} (${f.category || "file"}${f.period_start ? ", " + f.period_start : ""})`).join("; ") || "none"}
REPORTS: ${(reps || []).map((r: any) => `${r.title} ${r.period_start || ""}–${r.period_end || ""} [${r.status}]`).join("; ") || "none"}
${texts.length ? "\nSELECTED FILES:\n" + texts.join("\n\n") : ""}
${(hist || []).length ? "\nEARLIER IN THIS CONVERSATION (latest first):\n" + (hist || []).map((h: any) => `Q: ${h.question}\nA: ${String(h.answer || "").slice(0, 800)}`).join("\n") : ""}`;
      const system = `You are Nora, The Resident Bookkeeper's AI bookkeeper, working inside TRB's portal and helping ${who}, a TRB bookkeeper, with client ${client?.name}.
Use ONLY the client information and files given. Never invent figures, transactions or documents; if something is not in the files, say so and say what to ask the client for. Show your workings for any numbers.
Be practical and concise. Use plain text with short headings and numbered points (no markdown tables). Nigerian context by default (naira, VAT 7.5%, WHT, PAYE, pension, NTA 2025 rules) unless the client is in another country.
Never tell the bookkeeper to send anything to the client; reports go to Nancy for review first. Keep client information confidential.`;
      const ask = body.action === "review"
        ? `${context}\n\nReview the selected file(s) as TRB's reviewer before ${who} submits them to Nancy. Check against TRB's month-end checklist:
1. Every bank and card account reconciled: book balance agrees with the statement; unreconciled items explained.
2. Nothing left uncategorised or in suspense; no duplicates; transfers between own accounts not counted as income or expense.
3. Owner drawings, loans and capital not treated as income or expenses.
4. VAT, WHT, PAYE and pension treated correctly where they appear.
5. Profit and loss reasonable (gross margin, unusual items, compare periods if given); balance sheet balances.
6. Figures agree between the reports and with the bank statements provided.
7. Missing documents or open questions for the client.
${question ? `Also: ${question}\n` : ""}Reply in this order: VERDICT (Ready to submit / Fix first), MUST FIX (numbered, with the figures), SHOULD CHECK, QUESTIONS FOR THE CLIENT.`
        : `${context}\n\nQUESTION FROM ${who.toUpperCase()}: ${question}`;
      let answer: string;
      try { answer = await ai(system, ask, body.action === "review" ? 3000 : 2000); }
      catch (e) { if (e instanceof NeedsKey) return json({ error: e.message, needs_key: true }, 409); throw e; }
      await logRow({ client_id: clientId, action: body.action, question: body.action === "review" ? `Review: ${chosen.map((f: any) => f.file_name).join(", ")}${question ? " — " + question : ""}` : question, answer, files: chosen.map((f: any) => f.file_name) });
      await audit("assistant", `${client?.name}: ${body.action === "review" ? "review of " + chosen.map((f: any) => f.file_name).join(", ") : question.slice(0, 200)}`);
      return json({ ok: true, answer });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
