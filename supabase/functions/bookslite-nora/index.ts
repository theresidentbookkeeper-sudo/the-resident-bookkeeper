// Nora — TRB Books Lite engine.
// Reads a bank statement, extracts and categorises transactions, reconciles the balances,
// builds the monthly pack (PDF + Excel) and tells the client when it is ready.
// Anything that does not add up is held back for the TRB team instead of being sent.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "npm:pdf-lib@1.17.1";

const SITE = "https://residentbookkeeper.com";
const BUCKET = "books-lite";
const MODEL = "claude-sonnet-4-5";
const AUTO_OK = 95;        // HIGH_CONFIDENCE_AUTO
const REVIEW_BELOW = 70;   // UNKNOWN_BLOCK
const TOLERANCE = 0.01;    // RECON_BALANCE

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type Tx = { date: string; description: string; reference?: string; debit: number; credit: number; balance?: number | null };
type Extracted = { bank_name?: string; account_name?: string; account_last4?: string; currency?: string; period_start?: string; period_end?: string; opening_balance?: number | null; closing_balance?: number | null; transactions: Tx[]; notes?: string };

// ---------- Claude ----------
async function claudeTool(system: string, content: unknown[], tool: { name: string; description: string; input_schema: unknown }, maxTokens = 12000) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set in Edge Function secrets.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: "tool", name: tool.name }, messages: [{ role: "user", content }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`AI service error ${res.status}: ${data?.error?.message || "unknown"}`);
  const use = (data.content || []).find((c: any) => c.type === "tool_use");
  if (!use) throw new Error("AI did not return a structured answer.");
  return use.input;
}

const b64 = (buf: Uint8Array) => { let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };

async function extractStatement(file: Uint8Array, fileName: string, currency: string): Promise<Extracted> {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  let part: unknown;
  if (ext === "pdf") part = { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(file) } };
  else if (["png", "jpg", "jpeg", "webp"].includes(ext)) part = { type: "image", source: { type: "base64", media_type: ext === "jpg" ? "image/jpeg" : `image/${ext}`, data: b64(file) } };
  else if (["xls", "xlsx"].includes(ext)) {
    const wb = XLSX.read(file, { type: "array", cellDates: true });
    const text = wb.SheetNames.map((n) => `## Sheet: ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n\n");
    part = { type: "text", text: text.slice(0, 200000) };
  } else part = { type: "text", text: new TextDecoder().decode(file).slice(0, 200000) };

  const tool = {
    name: "record_statement",
    description: "Record every transaction on the bank statement exactly as printed.",
    input_schema: {
      type: "object",
      required: ["transactions"],
      properties: {
        bank_name: { type: "string" }, account_name: { type: "string" }, account_last4: { type: "string", description: "Last 4 digits of the account number" },
        currency: { type: "string", description: "ISO code, e.g. NGN" },
        period_start: { type: "string", description: "YYYY-MM-DD" }, period_end: { type: "string", description: "YYYY-MM-DD" },
        opening_balance: { type: ["number", "null"] }, closing_balance: { type: ["number", "null"] },
        notes: { type: "string", description: "Anything unreadable, missing pages or doubts" },
        transactions: {
          type: "array",
          items: {
            type: "object", required: ["date", "description", "debit", "credit"],
            properties: {
              date: { type: "string", description: "Transaction date YYYY-MM-DD" },
              description: { type: "string" }, reference: { type: "string" },
              debit: { type: "number", description: "Money out, 0 if none" },
              credit: { type: "number", description: "Money in, 0 if none" },
              balance: { type: ["number", "null"], description: "Running balance after the transaction if shown" },
            },
          },
        },
      },
    },
  };
  const system = `You are Nora, a careful bookkeeper at The Resident Bookkeeper. Extract a bank statement into structured data.
Rules: copy every transaction row in the order printed; never invent, merge or skip rows; amounts are plain numbers without currency symbols or commas;
money leaving the account is debit, money entering is credit, never both; use the statement's own opening and closing balances when printed;
dates as YYYY-MM-DD (Nigerian statements are usually day-first). Default currency ${currency}. If something is unreadable say so in notes.`;
  const out = await claudeTool(system, [part, { type: "text", text: "Extract this statement with the record_statement tool." }], tool, 16000) as Extracted;
  out.transactions = (out.transactions || []).map((t) => ({ ...t, debit: r2(Math.abs(t.debit || 0)), credit: r2(Math.abs(t.credit || 0)), description: String(t.description || "").trim() || "(no description)" }));
  return out;
}

// ---------- Categorisation ----------
const TYPE_BY_CODE = (code: string, isCredit: boolean): string => {
  if (code === "6100") return "bank_charge";
  if (code === "3000") return "owner_contribution";
  if (code === "3100") return "owner_draw";
  if (code === "2100") return "loan";
  if (code === "1000") return "transfer";
  if (code.startsWith("4")) return "income";
  if (code.startsWith("5") || code.startsWith("6") || code.startsWith("7")) return "expense";
  return isCredit ? "income" : "expense";
};

function ruleMatch(desc: string, rules: any[]) {
  const d = ` ${desc.toLowerCase()} `;
  for (const r of rules) {
    const p = String(r.pattern || "").toLowerCase().trim();
    if (!p) continue;
    const hit = r.match_type === "exact_description" ? desc.toLowerCase().trim() === p
      : new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(d);
    if (hit) return r;
  }
  return null;
}

async function categoriseWithAI(items: { i: number; description: string; reference?: string; debit: number; credit: number }[], coa: any[], business: any) {
  if (!items.length) return [];
  const tool = {
    name: "categorise",
    description: "Assign each transaction to one account from the chart of accounts.",
    input_schema: {
      type: "object", required: ["results"],
      properties: {
        results: {
          type: "array",
          items: {
            type: "object", required: ["i", "code", "confidence", "reason"],
            properties: { i: { type: "integer" }, code: { type: "string" }, confidence: { type: "number", description: "0-100: how sure you are" }, reason: { type: "string" } },
          },
        },
      },
    },
  };
  const system = `You are Nora, bookkeeper at The Resident Bookkeeper, categorising bank transactions for a small business (${business.business_name}, ${business.country_code}).
Chart of accounts:\n${coa.map((a) => `${a.code} ${a.name} (${a.account_type})`).join("\n")}
Rules: money out (debit) is usually an expense, cost of sales, asset purchase, owner drawing (3100), loan repayment (2100) or transfer (1000).
Money in (credit) is usually sales (4000), other income (4100), owner capital (3000), loan received (2100) or transfer (1000).
Transfers between the business's own accounts are 1000. POS/transfer receipts from customers are 4000. Be honest about confidence:
use 95+ only when the description makes it clear; 70-94 when likely; below 70 when guessing. Never invent accounts.`;
  const out = await claudeTool(system, [{ type: "text", text: JSON.stringify(items) }], tool, 8000) as any;
  const valid = new Set(coa.map((a) => a.code));
  return (out.results || []).filter((r: any) => valid.has(String(r.code)));
}

// ---------- Report building ----------
function buildSummary(txs: any[], coa: any[], recons: any[], currency: string) {
  const name = Object.fromEntries(coa.map((a) => [a.code, a.name]));
  const typeOf = Object.fromEntries(coa.map((a) => [a.code, a.account_type]));
  const lines: Record<string, number> = {};
  const other: Record<string, number> = {};
  let totalIn = 0, totalOut = 0;
  for (const t of txs) {
    const code = t.category_code || (t.credit > 0 ? "4100" : "7300");
    const amt = r2(Number(t.credit) - Number(t.debit));
    totalIn += Number(t.credit); totalOut += Number(t.debit);
    const at = typeOf[code];
    if (at === "Income" || at === "Cost of Sales" || at === "Expense") lines[code] = r2((lines[code] || 0) + amt);
    else other[code] = r2((other[code] || 0) + amt);
  }
  const pick = (types: string[], sign: number) => Object.entries(lines).filter(([c]) => types.includes(typeOf[c])).map(([c, v]) => ({ code: c, name: name[c], amount: r2(v * sign) })).sort((a, b) => b.amount - a.amount);
  const income = pick(["Income"], 1), cos = pick(["Cost of Sales"], -1), expenses = pick(["Expense"], -1);
  const sum = (a: any[]) => r2(a.reduce((s, x) => s + x.amount, 0));
  const revenue = sum(income), costOfSales = sum(cos), grossProfit = r2(revenue - costOfSales), totalExpenses = sum(expenses), netProfit = r2(grossProfit - totalExpenses);
  const nonPL = Object.entries(other).map(([c, v]) => ({ code: c, name: name[c] || c, amount: v }));
  return {
    currency, transaction_count: txs.length, revenue, cost_of_sales: costOfSales, gross_profit: grossProfit, total_expenses: totalExpenses, net_profit: netProfit,
    income, cost_of_sales_lines: cos, expenses, non_pl_movements: nonPL,
    cash: { money_in: r2(totalIn), money_out: r2(totalOut), net_movement: r2(totalIn - totalOut) },
    reconciliations: recons.map((r) => ({ bank: r.bank, opening: r.statement_opening_balance, closing: r.statement_closing_balance, ledger_closing: r.ledger_closing_balance, difference: r.difference, status: r.status })),
  };
}

const fmt = (n: number, cur: string) => { const v = Number(n || 0), t = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? `${cur} (${t})` : `${cur} ${t}`; };
const asc = (s: string) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/₦/g, "NGN ").replace(/[^\x20-\x7E]/g, "");

function buildXlsx(business: any, period: { start: string; end: string }, s: any, txs: any[], coaName: Record<string, string>) {
  const wb = XLSX.utils.book_new();
  const head = [["The Resident Bookkeeper - Books Lite monthly pack"], [business.business_name], [`Period: ${period.start} to ${period.end}`], [`Currency: ${s.currency}`], []];
  const pl: any[][] = [...head, ["PROFIT AND LOSS"], ["Code", "Account", "Amount"]];
  pl.push(["", "Income", ""]); s.income.forEach((l: any) => pl.push([l.code, l.name, l.amount])); pl.push(["", "Total income", s.revenue]);
  if (s.cost_of_sales_lines.length) { pl.push(["", "Cost of sales", ""]); s.cost_of_sales_lines.forEach((l: any) => pl.push([l.code, l.name, l.amount])); pl.push(["", "Gross profit", s.gross_profit]); }
  pl.push(["", "Expenses", ""]); s.expenses.forEach((l: any) => pl.push([l.code, l.name, l.amount])); pl.push(["", "Total expenses", s.total_expenses]);
  pl.push([], ["", "NET PROFIT / (LOSS)", s.net_profit]);
  if (s.non_pl_movements.length) { pl.push([], ["", "Movements not in profit and loss", ""]); s.non_pl_movements.forEach((l: any) => pl.push([l.code, l.name, l.amount])); }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pl), "Profit and Loss");
  const cash: any[][] = [...head, ["CASH SUMMARY"], ["Money in", s.cash.money_in], ["Money out", s.cash.money_out], ["Net movement", s.cash.net_movement], [], ["BANK RECONCILIATION"], ["Bank", "Statement opening", "Statement closing", "Books closing", "Difference", "Status"]];
  s.reconciliations.forEach((r: any) => cash.push([r.bank, r.opening, r.closing, r.ledger_closing, r.difference, r.status]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cash), "Cash and Reconciliation");
  const tx: any[][] = [["Date", "Description", "Reference", "Money in", "Money out", "Account code", "Account"]];
  txs.forEach((t) => tx.push([t.transaction_date, t.description, t.reference || "", Number(t.credit) || "", Number(t.debit) || "", t.category_code, coaName[t.category_code] || ""]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tx), "Transactions");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

async function buildPdf(business: any, period: { start: string; end: string }, s: any, txs: any[], coaName: Record<string, string>) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const INK = rgb(0.08, 0.07, 0.05), RED = rgb(0.72, 0.07, 0.17), GOLD = rgb(0.65, 0.49, 0.12), MUTE = rgb(0.35, 0.32, 0.28), LINE = rgb(0.85, 0.8, 0.69);
  const W = 595.28, H = 841.89, M = 48;
  let page: PDFPage, y = 0, pageNo = 0;
  const text = (t: string, x: number, size = 10, f: PDFFont = font, color = INK) => page.drawText(asc(t), { x, y, size, font: f, color });
  const right = (t: string, xr: number, size = 10, f: PDFFont = font, color = INK) => { const s2 = asc(t); page.drawText(s2, { x: xr - f.widthOfTextAtSize(s2, size), y, size, font: f, color }); };
  const fit = (t: string, max: number, size = 9) => { let s2 = asc(t); while (s2.length > 3 && font.widthOfTextAtSize(s2, size) > max) s2 = s2.slice(0, -2); return s2 === asc(t) ? s2 : s2 + "..."; };
  const newPage = () => {
    page = doc.addPage([W, H]); pageNo++; y = H - M;
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: RED });
    text("THE RESIDENT BOOKKEEPER", M, 9, bold, GOLD); right(`Books Lite  |  ${business.business_name}`, W - M, 9, font, MUTE);
    y -= 14; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE }); y -= 22;
    page.drawText(`Page ${pageNo}`, { x: W - M - 30, y: 24, size: 8, font, color: MUTE });
    page.drawText(asc("Prepared by Nora (AI bookkeeper) for The Resident Bookkeeper. Based only on the bank statements provided."), { x: M, y: 24, size: 8, font, color: MUTE });
  };
  const need = (h: number) => { if (y - h < 50) newPage(); };
  const heading = (t: string) => { need(40); y -= 6; text(t, M, 13, bold, INK); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + 40, y }, thickness: 2, color: RED }); y -= 16; };
  const row = (label: string, amount: number | string, opts: { b?: boolean; indent?: number } = {}) => { need(16); text(label, M + (opts.indent || 0), 10, opts.b ? bold : font); right(typeof amount === "number" ? fmt(amount, s.currency) : amount, W - M, 10, opts.b ? bold : font); y -= 15; };
  const rule = () => { page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.5, color: LINE }); };

  newPage();
  text("Monthly report pack", M, 24, bold); y -= 22;
  text(`${period.start}  to  ${period.end}`, M, 11, font, MUTE); y -= 30;
  // Key figures
  const boxes = [["Money in", s.cash.money_in], ["Money out", s.cash.money_out], ["Net profit / (loss)", s.net_profit]];
  const bw = (W - 2 * M - 20) / 3;
  boxes.forEach(([l, v], i) => {
    const x = M + i * (bw + 10);
    page.drawRectangle({ x, y: y - 46, width: bw, height: 56, color: rgb(0.98, 0.96, 0.92), borderColor: LINE, borderWidth: 0.8 });
    page.drawText(asc(String(l)), { x: x + 10, y: y - 6, size: 9, font, color: MUTE });
    page.drawText(asc(fmt(Number(v), s.currency)), { x: x + 10, y: y - 30, size: 13, font: bold, color: i === 2 && Number(v) < 0 ? RED : INK });
  });
  y -= 76;

  heading("Profit and loss");
  row("Income", "", { b: true }); s.income.forEach((l: any) => row(l.name, l.amount, { indent: 12 })); rule(); row("Total income", s.revenue, { b: true });
  if (s.cost_of_sales_lines.length) { y -= 4; row("Cost of sales", "", { b: true }); s.cost_of_sales_lines.forEach((l: any) => row(l.name, l.amount, { indent: 12 })); rule(); row("Gross profit", s.gross_profit, { b: true }); }
  y -= 4; row("Expenses", "", { b: true }); s.expenses.forEach((l: any) => row(l.name, l.amount, { indent: 12 })); rule(); row("Total expenses", s.total_expenses, { b: true });
  y -= 6; rule(); row("Net profit / (loss)", s.net_profit, { b: true });
  if (s.non_pl_movements.length) { y -= 8; row("Other movements (not profit or loss)", "", { b: true }); s.non_pl_movements.forEach((l: any) => row(l.name, l.amount, { indent: 12 })); }

  heading("Bank reconciliation");
  for (const r of s.reconciliations) {
    row(r.bank, "", { b: true }); row("Statement opening balance", Number(r.opening), { indent: 12 }); row("Statement closing balance", Number(r.closing), { indent: 12 });
    row("Closing balance per books", Number(r.ledger_closing), { indent: 12 }); row("Difference", Number(r.difference), { indent: 12 });
    row("Status", r.status === "reconciled" ? "Reconciled" : "Under review", { indent: 12 }); y -= 4;
  }

  heading("Transactions");
  const cols = [M, M + 62, M + 300, M + 380, M + 460];
  const th = () => { need(20); [["Date", 0], ["Description", 1], ["Account", 2]].forEach(([t, i]) => text(String(t), cols[Number(i)], 8, bold, MUTE)); right("In", cols[4] - 6, 8, bold, MUTE); right("Out", W - M, 8, bold, MUTE); y -= 12; };
  th();
  for (const t of txs) {
    if (y < 64) { newPage(); th(); }
    text(t.transaction_date, cols[0], 8); text(fit(t.description, 232, 8), cols[1], 8); text(fit(coaName[t.category_code] || "", 150, 8), cols[2] + 0, 8, font, MUTE);
    if (Number(t.credit)) right(Number(t.credit).toLocaleString("en-US", { minimumFractionDigits: 2 }), cols[4] - 6, 8);
    if (Number(t.debit)) right(Number(t.debit).toLocaleString("en-US", { minimumFractionDigits: 2 }), W - M, 8);
    y -= 12;
  }
  return await doc.save();
}

// ---------- Email ----------
async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { sent: false, reason: "No email service connected yet (RESEND_API_KEY missing)." };
  const from = Deno.env.get("TRB_EMAIL_FROM") || "The Resident Bookkeeper <reports@residentbookkeeper.com>";
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, html }) });
  if (!res.ok) return { sent: false, reason: `Email service returned ${res.status}: ${await res.text()}` };
  return { sent: true };
}
const readyEmail = (name: string, period: string) => `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#14110E">
<div style="border-top:6px solid #B8112B;padding:24px 0 8px"><b style="color:#A67C1E;letter-spacing:.12em;font-size:12px">THE RESIDENT BOOKKEEPER</b></div>
<h2 style="margin:8px 0">Your Books Lite reports are ready</h2><p>Dear ${name},</p>
<p>Your reports for <b>${period}</b> have been prepared and are ready to view and download.</p>
<p><a href="${SITE}/platform" style="display:inline-block;background:#B8112B;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">View my reports</a></p>
<p style="color:#5A5247;font-size:13px">Sign in with the email address you registered with. If anything looks wrong, reply to this email and our team will check it.</p>
<p style="color:#5A5247;font-size:13px">Accurate Records &middot; Smarter Decisions &middot; Stronger Business</p></div>`;

// ---------- Core work ----------
async function audit(admin: SupabaseClient, business_id: string, action: string, entity_type: string, entity_id: string | null, after: unknown = null, reason: string | null = null) {
  await admin.from("books_lite_audit_log").insert({ business_id, actor_type: "nora", action, entity_type, entity_id, after_data: after, reason });
}

async function clientContact(admin: SupabaseClient, business: any) {
  const { data: c } = await admin.from("clients").select("email,contact_name,name").eq("portal_user_id", business.owner_id).maybeSingle();
  if (c?.email) return { email: c.email, name: c.contact_name || c.name || business.business_name };
  const { data: u } = await admin.auth.admin.getUserById(business.owner_id);
  return { email: u?.user?.email || null, name: business.business_name };
}

async function rebuildReport(admin: SupabaseClient, business: any, periodStart: string, periodEnd: string, statementId: string | null) {
  const [{ data: coa }, { data: txs }, { data: recs }, { data: accts }] = await Promise.all([
    admin.from("books_lite_chart_of_accounts").select("code,name,account_type").eq("is_active", true).order("sort_order"),
    admin.from("books_lite_transactions").select("*").eq("business_id", business.id).gte("transaction_date", periodStart).lte("transaction_date", periodEnd).neq("categorisation_status", "rejected").eq("is_duplicate", false).order("transaction_date").order("created_at"),
    admin.from("books_lite_reconciliations").select("*").eq("business_id", business.id).eq("period_start", periodStart).eq("period_end", periodEnd),
    admin.from("books_lite_bank_accounts").select("id,bank_name,account_last4").eq("business_id", business.id),
  ]);
  const bankName = Object.fromEntries((accts || []).map((a: any) => [a.id, `${a.bank_name}${a.account_last4 ? " ****" + a.account_last4 : ""}`]));
  const summary = buildSummary(txs || [], coa || [], (recs || []).map((r: any) => ({ ...r, bank: bankName[r.bank_account_id] || "Bank account" })), business.currency_code || "NGN");
  const coaName = Object.fromEntries((coa || []).map((a: any) => [a.code, a.name]));
  const period = { start: periodStart, end: periodEnd };
  const tag = periodStart.slice(0, 7);
  const base = `${business.id}/reports/${tag}`;
  const pdf = await buildPdf(business, period, summary, txs || [], coaName);
  const xlsx = buildXlsx(business, period, summary, txs || [], coaName);
  const up1 = await admin.storage.from(BUCKET).upload(`${base}/TRB-Books-Lite-${tag}.pdf`, pdf, { contentType: "application/pdf", upsert: true });
  const up2 = await admin.storage.from(BUCKET).upload(`${base}/TRB-Books-Lite-${tag}.xlsx`, xlsx, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true });
  if (up1.error || up2.error) throw new Error("Could not save report files: " + (up1.error?.message || up2.error?.message));
  const row = { business_id: business.id, owner_id: business.owner_id, period_start: periodStart, period_end: periodEnd, report_type: "monthly_pack", pdf_path: `${base}/TRB-Books-Lite-${tag}.pdf`, xlsx_path: `${base}/TRB-Books-Lite-${tag}.xlsx`, storage_path: `${base}/TRB-Books-Lite-${tag}.pdf`, summary, generated_at: new Date().toISOString(), ...(statementId ? { statement_id: statementId } : {}) };
  const { data: existing } = await admin.from("books_lite_reports").select("id,status,notified_at").eq("business_id", business.id).eq("report_type", "monthly_pack").eq("period_start", periodStart).eq("period_end", periodEnd).maybeSingle();
  if (existing) { await admin.from("books_lite_reports").update(row).eq("id", existing.id); return { id: existing.id, status: existing.status, notified_at: existing.notified_at, summary }; }
  const { data: ins, error } = await admin.from("books_lite_reports").insert({ ...row, status: "draft" }).select("id,status,notified_at").single();
  if (error) throw error;
  return { ...ins, summary };
}

async function releaseReport(admin: SupabaseClient, business: any, reportId: string, periodLabel: string) {
  await admin.from("books_lite_reports").update({ status: "ready" }).eq("id", reportId);
  const contact = await clientContact(admin, business);
  let note = "Report marked ready.";
  if (contact.email) {
    const r = await sendEmail(contact.email, "Your Books Lite reports are ready", readyEmail(contact.name, periodLabel));
    if (r.sent) { await admin.from("books_lite_reports").update({ notified_at: new Date().toISOString() }).eq("id", reportId); note += ` Email sent to ${contact.email}.`; }
    else note += ` Email not sent: ${r.reason}`;
  } else note += " No client email on file.";
  await audit(admin, business.id, "report_released", "report", reportId, null, note);
  return note;
}

const monthLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

async function processUpload(admin: SupabaseClient, uploadId: string) {
  const { data: up } = await admin.from("books_lite_statement_uploads").select("*").eq("id", uploadId).maybeSingle();
  if (!up) throw new Error("Statement not found.");
  const { data: business } = await admin.from("books_lite_businesses").select("*").eq("id", up.business_id).single();
  const setUp = (patch: Record<string, unknown>) => admin.from("books_lite_statement_uploads").update(patch).eq("id", uploadId);
  await setUp({ status: "extracting", attempts: (up.attempts || 0) + 1, error_message: null });
  try {
    // 1. Read
    const dl = await admin.storage.from(BUCKET).download(up.storage_path);
    if (dl.error || !dl.data) throw new Error("Could not open the uploaded file.");
    const ex = await extractStatement(new Uint8Array(await dl.data.arrayBuffer()), up.file_name, business.currency_code || "NGN");
    if (!ex.transactions.length) throw new Error("No transactions could be read from this statement." + (ex.notes ? " " + ex.notes : ""));
    await setUp({ status: "processing" });

    // 2. Balances
    const txs = ex.transactions.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && (t.debit > 0 || t.credit > 0));
    const sumIn = r2(txs.reduce((s, t) => s + t.credit, 0)), sumOut = r2(txs.reduce((s, t) => s + t.debit, 0));
    let opening = ex.opening_balance ?? null, closing = ex.closing_balance ?? null;
    const first = txs[0], last = txs[txs.length - 1];
    if (opening == null && first?.balance != null) opening = r2(first.balance - first.credit + first.debit);
    if (closing == null && last?.balance != null) closing = r2(last.balance);
    const dates = txs.map((t) => t.date).sort();
    const periodStart = up.period_start || ex.period_start || dates[0], periodEnd = up.period_end || ex.period_end || dates[dates.length - 1];
    const ledgerClosing = opening != null ? r2(opening + sumIn - sumOut) : null;
    const difference = closing != null && ledgerClosing != null ? r2(closing - ledgerClosing) : null;
    const reconciled = difference != null && Math.abs(difference) <= TOLERANCE;
    let balanceBreaks = 0;
    for (let i = 1; i < txs.length; i++) { const p = txs[i - 1], c = txs[i]; if (p.balance != null && c.balance != null && Math.abs(r2(p.balance + c.credit - c.debit) - c.balance) > TOLERANCE) balanceBreaks++; }

    // 3. Duplicates and plan limit
    const hashOf = async (t: Tx) => { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode([up.bank_account_id, t.date, t.description, t.reference || "", t.debit, t.credit, t.balance ?? ""].join("|"))); return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join(""); };
    const withHash = await Promise.all(txs.map(async (t) => ({ ...t, hash: await hashOf(t) })));
    const { data: existing } = await admin.from("books_lite_transactions").select("source_hash").eq("business_id", business.id).eq("bank_account_id", up.bank_account_id).gte("transaction_date", dates[0]).lte("transaction_date", dates[dates.length - 1]);
    const seen = new Set((existing || []).map((e: any) => e.source_hash));
    const fresh = withHash.filter((t) => !seen.has(t.hash));
    const skipped = withHash.length - fresh.length;
    const monthCounts: Record<string, number> = {};
    for (const t of fresh) monthCounts[t.date.slice(0, 7)] = (monthCounts[t.date.slice(0, 7)] || 0) + 1;
    for (const [m, n] of Object.entries(monthCounts)) {
      const { count } = await admin.from("books_lite_transactions").select("id", { count: "exact", head: true }).eq("business_id", business.id).gte("transaction_date", `${m}-01`).lt("transaction_date", new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10));
      if ((count || 0) + n > (business.max_monthly_transactions || 100)) {
        await admin.from("books_lite_review_items").insert({ business_id: business.id, review_type: "other", severity: "high", title: `Over the Books Lite limit for ${m}`, explanation: `This statement has ${n} new transactions for ${m}; with ${count || 0} already recorded that exceeds the ${business.max_monthly_transactions || 100}-transaction plan limit.`, suggested_action: "Contact the client about upgrading to managed bookkeeping, or raise the limit for this month." });
        await setUp({ status: "review", nora_notes: `Held: over the monthly transaction limit for ${m}.`, period_start: periodStart, period_end: periodEnd });
        await audit(admin, business.id, "statement_held", "statement", uploadId, null, "Over plan limit");
        return { status: "review", reason: "over_limit" };
      }
    }

    // 4. Categorise: rules first, then AI
    const [{ data: rules }, { data: coa }] = await Promise.all([
      admin.from("books_lite_category_rules").select("*").eq("active", true).or(`business_id.is.null,business_id.eq.${business.id}`).order("business_id", { nullsFirst: false }),
      admin.from("books_lite_chart_of_accounts").select("code,name,account_type").eq("is_active", true).order("sort_order"),
    ]);
    const cat: { code: string; conf: number; reason: string }[] = fresh.map(() => ({ code: "", conf: 0, reason: "" }));
    const toAI: any[] = [];
    fresh.forEach((t, i) => {
      const r = ruleMatch(`${t.description} ${t.reference || ""}`, rules || []);
      if (r && t.debit > 0) cat[i] = { code: r.chart_account_code, conf: Math.max(Number(r.confidence_threshold) || 0, 96), reason: `Rule: ${r.pattern}` };
      else toAI.push({ i, description: t.description, reference: t.reference, debit: t.debit, credit: t.credit });
    });
    for (let k = 0; k < toAI.length; k += 60) {
      const res = await categoriseWithAI(toAI.slice(k, k + 60), coa || [], business);
      for (const r of res) if (cat[r.i]) cat[r.i] = { code: String(r.code), conf: Math.max(0, Math.min(100, Number(r.confidence) || 0)), reason: r.reason };
    }

    // 5. Save transactions
    const rows = fresh.map((t, i) => {
      const c = cat[i].code || (t.credit > 0 ? "4100" : "7300");
      const conf = cat[i].code ? cat[i].conf : 0;
      const ttype = TYPE_BY_CODE(c, t.credit > 0);
      const alwaysReview = ["owner_contribution", "owner_draw", "loan"].includes(ttype);
      return {
        business_id: business.id, bank_account_id: up.bank_account_id, statement_id: uploadId, transaction_date: t.date, description: t.description, reference: t.reference || null,
        debit: t.debit, credit: t.credit, amount: r2(t.credit - t.debit), currency_code: ex.currency || business.currency_code || "NGN",
        category_code: c, suggested_category_code: c, category_confidence: conf,
        categorisation_status: conf < REVIEW_BELOW ? "needs_review" : "auto_approved", transaction_type: ttype, source_hash: t.hash, _reason: cat[i].reason, _always: alwaysReview,
      };
    });
    const { data: saved, error: insErr } = await admin.from("books_lite_transactions").insert(rows.map(({ _reason, _always, ...r }) => r)).select("id,description,category_code,category_confidence,categorisation_status,transaction_type,debit,credit");
    if (insErr) throw new Error("Could not save transactions: " + insErr.message);

    // 6. Review items (for the team; never shown to the client)
    const items: any[] = [];
    (saved || []).forEach((s: any, i: number) => {
      const amt = fmt(Number(s.debit) || Number(s.credit), business.currency_code || "NGN");
      if (s.categorisation_status === "needs_review") items.push({ business_id: business.id, transaction_id: s.id, review_type: "categorisation", severity: "medium", title: `Unsure: ${s.description.slice(0, 80)}`, explanation: `${amt}. Nora's best guess is ${s.category_code} (${s.category_confidence}% sure). ${rows[i]._reason || ""}`, suggested_action: "Confirm or change the account." });
      else if (rows[i]._always) items.push({ business_id: business.id, transaction_id: s.id, review_type: "categorisation", severity: "low", title: `Owner money or loan: ${s.description.slice(0, 80)}`, explanation: `${amt} treated as ${s.transaction_type.replace("_", " ")}. These are always flagged for a human check.`, suggested_action: "Confirm this is correct." });
      else if (Number(s.category_confidence) < AUTO_OK) items.push({ business_id: business.id, transaction_id: s.id, review_type: "categorisation", severity: "low", title: `Likely: ${s.description.slice(0, 80)}`, explanation: `${amt} put in ${s.category_code} (${s.category_confidence}% sure).`, suggested_action: "Spot-check if time allows." });
    });
    if (!reconciled) items.push({ business_id: business.id, review_type: "reconciliation", severity: "high", title: "Statement does not reconcile", explanation: difference == null ? "Opening or closing balance could not be read from the statement." : `Opening ${opening} + money in ${sumIn} - money out ${sumOut} = ${ledgerClosing}, but the statement closes at ${closing} (difference ${difference}).`, suggested_action: "Check for missing pages or misread rows, then tell Nora what to fix." });
    if (balanceBreaks) items.push({ business_id: business.id, review_type: "missing_data", severity: "medium", title: `${balanceBreaks} running-balance break(s)`, explanation: "The running balance printed on the statement does not follow from the previous row in some places. A row may be missing or misread.", suggested_action: "Compare with the original statement." });
    if (items.length) await admin.from("books_lite_review_items").insert(items);

    // 7. Reconciliation record
    await admin.from("books_lite_reconciliations").insert({ business_id: business.id, bank_account_id: up.bank_account_id, period_start: periodStart, period_end: periodEnd, statement_opening_balance: opening, statement_closing_balance: closing, ledger_opening_balance: opening, ledger_closing_balance: ledgerClosing, difference, status: reconciled ? (balanceBreaks ? "reconciled_review" : "reconciled") : "issue", notes: `Nora: ${fresh.length} new, ${skipped} duplicate(s) skipped.` });

    // 8. Reports, then release or hold
    const report = await rebuildReport(admin, business, periodStart, periodEnd, uploadId);
    const unsure = (saved || []).filter((s: any) => s.categorisation_status === "needs_review").length;
    const unsureLimit = Math.max(2, Math.floor((saved || []).length * 0.1));
    const canRelease = reconciled && balanceBreaks === 0 && unsure <= unsureLimit;
    const notes = `Read ${txs.length} transactions (${fresh.length} new, ${skipped} duplicates skipped). ${reconciled ? "Balances agree." : "Balances do not agree."} ${unsure} uncertain.` + (ex.notes ? ` Statement note: ${ex.notes}` : "");
    if (canRelease) {
      const note = await releaseReport(admin, business, report.id, monthLabel(periodStart));
      await setUp({ status: "reconciled", processed_at: new Date().toISOString(), transaction_count: fresh.length, period_start: periodStart, period_end: periodEnd, nora_notes: notes + " " + note });
      await audit(admin, business.id, "statement_processed", "statement", uploadId, report.summary, notes);
      return { status: "ready", report_id: report.id, notes };
    }
    await setUp({ status: "review", processed_at: new Date().toISOString(), transaction_count: fresh.length, period_start: periodStart, period_end: periodEnd, nora_notes: notes + " Held for TRB team review." });
    await audit(admin, business.id, "statement_held", "statement", uploadId, report.summary, notes);
    return { status: "review", report_id: report.id, notes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Processing failed.";
    await setUp({ status: "failed", error_message: msg });
    await admin.from("books_lite_review_items").insert({ business_id: up.business_id, review_type: "other", severity: "high", title: "Nora could not process a statement", explanation: `${up.file_name}: ${msg}`, suggested_action: "Check the file, then ask Nora to reprocess it." });
    await audit(admin, up.business_id, "statement_failed", "statement", uploadId, null, msg);
    return { status: "failed", error: msg };
  }
}

async function runInstruction(admin: SupabaseClient, instructionId: string) {
  const { data: ins } = await admin.from("books_lite_instructions").select("*").eq("id", instructionId).single();
  const { data: business } = await admin.from("books_lite_businesses").select("*").eq("id", ins.business_id).single();
  await admin.from("books_lite_instructions").update({ status: "working" }).eq("id", instructionId);
  try {
    const [{ data: coa }, { data: txs }, { data: reports }, { data: open }] = await Promise.all([
      admin.from("books_lite_chart_of_accounts").select("code,name").eq("is_active", true).order("sort_order"),
      admin.from("books_lite_transactions").select("id,transaction_date,description,reference,debit,credit,category_code,categorisation_status").eq("business_id", business.id).order("transaction_date", { ascending: false }).limit(300),
      admin.from("books_lite_reports").select("id,period_start,period_end,status").eq("business_id", business.id).order("period_start", { ascending: false }).limit(12),
      admin.from("books_lite_review_items").select("id,title,transaction_id,severity").eq("business_id", business.id).eq("status", "open").limit(100),
    ]);
    const tool = {
      name: "apply_instruction", description: "Turn the team's instruction into specific changes.",
      input_schema: {
        type: "object", required: ["reply", "changes", "resolve_review_ids", "release_report_ids"],
        properties: {
          reply: { type: "string", description: "Short plain-English summary of what you did, or why you could not." },
          changes: { type: "array", items: { type: "object", required: ["transaction_id", "category_code"], properties: { transaction_id: { type: "string" }, category_code: { type: "string" }, exclude: { type: "boolean", description: "true to mark the transaction rejected (e.g. a duplicate)" } } } },
          resolve_review_ids: { type: "array", items: { type: "string" } },
          release_report_ids: { type: "array", items: { type: "string" }, description: "Only if the instruction says to release/send the report to the client." },
        },
      },
    };
    const system = `You are Nora, AI bookkeeper at The Resident Bookkeeper. A TRB team member has given you an instruction about the Books Lite client "${business.business_name}".
Only act within the instruction. Use exact transaction ids and review ids from the data. Account codes must come from the chart of accounts.
Chart of accounts: ${(coa || []).map((a: any) => `${a.code} ${a.name}`).join("; ")}`;
    const out = await claudeTool(system, [{ type: "text", text: JSON.stringify({ instruction: ins.instruction, transactions: txs, reports, open_review_items: open }) }], tool, 6000) as any;
    const valid = new Set((coa || []).map((a: any) => a.code)), txIds = new Set((txs || []).map((t: any) => t.id));
    const touched: string[] = [];
    for (const c of out.changes || []) {
      if (!txIds.has(c.transaction_id) || (!c.exclude && !valid.has(String(c.category_code)))) continue;
      const t = (txs || []).find((x: any) => x.id === c.transaction_id);
      await admin.from("books_lite_transactions").update(c.exclude ? { categorisation_status: "rejected" } : { category_code: String(c.category_code), transaction_type: TYPE_BY_CODE(String(c.category_code), Number(t.credit) > 0), categorisation_status: "customer_confirmed", category_confidence: 100 }).eq("id", c.transaction_id);
      await admin.from("books_lite_review_items").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("transaction_id", c.transaction_id).eq("status", "open");
      touched.push(t.transaction_date);
    }
    if ((out.resolve_review_ids || []).length) await admin.from("books_lite_review_items").update({ status: "resolved", resolved_at: new Date().toISOString() }).in("id", out.resolve_review_ids).eq("business_id", business.id);
    // Rebuild every report period that changed
    const notes: string[] = [];
    for (const r of reports || []) {
      if (touched.some((d) => d >= r.period_start && d <= r.period_end)) { await rebuildReport(admin, business, r.period_start, r.period_end, null); notes.push(`Rebuilt ${monthLabel(r.period_start)} report.`); }
    }
    for (const id of out.release_report_ids || []) {
      const r = (reports || []).find((x: any) => x.id === id);
      if (r) notes.push(await releaseReport(admin, business, id, monthLabel(r.period_start)));
    }
    const reply = `${out.reply} ${notes.join(" ")}`.trim();
    await admin.from("books_lite_instructions").update({ status: "done", response: reply, completed_at: new Date().toISOString() }).eq("id", instructionId);
    await audit(admin, business.id, "instruction_done", "instruction", instructionId, out, ins.instruction);
  } catch (e) {
    await admin.from("books_lite_instructions").update({ status: "failed", response: e instanceof Error ? e.message : "Failed", completed_at: new Date().toISOString() }).eq("id", instructionId);
  }
}

// ---------- HTTP ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication required." }, 401);
    // Scheduled jobs (pg_cron via pg_net) prove themselves with an internal token kept in a server-only table.
    const cronHeader = req.headers.get("x-trb-cron") || "";
    let isSystem = token === service;
    if (!isSystem && cronHeader) {
      const { data: sec } = await admin.from("trb_internal_secrets").select("value").eq("name", "nora_cron_token").maybeSingle();
      isSystem = !!sec?.value && sec.value === cronHeader;
      if (!isSystem) return json({ error: "Invalid internal token." }, 401);
    }
    let uid: string | null = null, isTeam = isSystem;
    if (!isSystem) {
      const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
      const { data, error } = await caller.auth.getUser(token);
      if (error || !data.user) return json({ error: "Invalid session." }, 401);
      uid = data.user.id;
      const { data: tid } = await caller.rpc("trb_business_owner_id");
      isTeam = !!tid;
    }
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const bg = (p: Promise<unknown>) => { // @ts-ignore EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(p.catch((e) => console.error(e))); };

    if (action === "process" || action === "reprocess") {
      const { data: up } = await admin.from("books_lite_statement_uploads").select("id,business_id,status,owner_id,bank_account_id,period_start,period_end").eq("id", body.upload_id).maybeSingle();
      if (!up) return json({ error: "Statement not found." }, 404);
      if (!isTeam && up.owner_id !== uid) return json({ error: "Not allowed." }, 403);
      if (action === "process" && !isTeam && !["uploaded", "failed"].includes(up.status)) return json({ error: "This statement is already being handled." }, 409);
      if (action === "reprocess") {
        if (!isTeam) return json({ error: "Only the TRB team can reprocess." }, 403);
        await admin.from("books_lite_transactions").delete().eq("statement_id", up.id);
        await admin.from("books_lite_reconciliations").delete().eq("bank_account_id", up.bank_account_id).eq("period_start", up.period_start).eq("period_end", up.period_end);
        await admin.from("books_lite_statement_uploads").update({ status: "uploaded" }).eq("id", up.id);
      }
      bg(processUpload(admin, up.id));
      return json({ ok: true, status: "processing", message: "Nora is working on this statement." }, 202);
    }
    if (action === "ingest") {
      // The TRB team (or a scheduled job) hands Nora a statement on the client's behalf, e.g. one sent by WhatsApp or email.
      if (!isTeam) return json({ error: "Only the TRB team can upload for a client." }, 403);
      const { business_id, bank_account_id, period_start, period_end, file_name, content_base64 } = body || {};
      if (!business_id || !bank_account_id || !period_start || !period_end || !file_name || !content_base64) return json({ error: "business_id, bank_account_id, period_start, period_end, file_name and content_base64 are required." }, 400);
      const { data: business } = await admin.from("books_lite_businesses").select("id,owner_id").eq("id", business_id).maybeSingle();
      if (!business) return json({ error: "Business not found." }, 404);
      const bytes = Uint8Array.from(atob(content_base64), (c) => c.charCodeAt(0));
      const safe = String(file_name).replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${business.id}/statements/${period_start.slice(0, 7)}/${Date.now()}-${safe}`;
      const upl = await admin.storage.from(BUCKET).upload(path, bytes, { upsert: false });
      if (upl.error) return json({ error: "Upload failed: " + upl.error.message }, 500);
      const { data: row, error } = await admin.from("books_lite_statement_uploads").insert({ business_id: business.id, bank_account_id, owner_id: business.owner_id, period_start, period_end, file_name: safe, storage_path: path, file_type: safe.split(".").pop(), status: "uploaded" }).select("id").single();
      if (error) return json({ error: error.message }, 500);
      bg(processUpload(admin, row.id));
      return json({ ok: true, upload_id: row.id, status: "processing" }, 202);
    }
    if (action === "instruct") {
      if (!isTeam) return json({ error: "Only the TRB team can instruct Nora." }, 403);
      bg(runInstruction(admin, body.instruction_id));
      return json({ ok: true, status: "working" }, 202);
    }
    if (action === "release") {
      if (!isTeam) return json({ error: "Only the TRB team can release reports." }, 403);
      const { data: rep } = await admin.from("books_lite_reports").select("id,business_id,period_start").eq("id", body.report_id).single();
      const { data: business } = await admin.from("books_lite_businesses").select("*").eq("id", rep.business_id).single();
      const note = await releaseReport(admin, business, rep.id, monthLabel(rep.period_start));
      await admin.from("books_lite_statement_uploads").update({ status: "reconciled" }).eq("business_id", rep.business_id).eq("status", "review").eq("period_start", rep.period_start);
      return json({ ok: true, message: note });
    }
    if (action === "sweep") {
      if (!isSystem) return json({ error: "Not allowed." }, 403);
      const stale = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: waiting } = await admin.from("books_lite_statement_uploads").select("id").or(`status.eq.uploaded,and(status.in.(extracting,processing),uploaded_at.lt.${stale})`).lt("attempts", 3).limit(5);
      for (const w of waiting || []) bg(processUpload(admin, w.id));
      const { data: pend } = await admin.from("books_lite_instructions").select("id").eq("status", "pending").limit(5);
      for (const p of pend || []) bg(runInstruction(admin, p.id));
      return json({ ok: true, statements: (waiting || []).length, instructions: (pend || []).length });
    }
    if (action === "sign") {
      // Short-lived download link for a report file the caller may see
      const path = String(body.path || "");
      const biz = path.split("/")[0];
      const { data: b } = await admin.from("books_lite_businesses").select("owner_id").eq("id", biz).maybeSingle();
      if (!b || (!isTeam && b.owner_id !== uid)) return json({ error: "Not allowed." }, 403);
      if (!isTeam) { const { data: rep } = await admin.from("books_lite_reports").select("status").or(`pdf_path.eq.${path},xlsx_path.eq.${path}`).maybeSingle(); if (rep?.status !== "ready") return json({ error: "This report is not ready yet." }, 403); }
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 300, { download: body.download ? path.split("/").pop() : undefined });
      if (error) return json({ error: error.message }, 500);
      return json({ url: data.signedUrl });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error." }, 500);
  }
});
