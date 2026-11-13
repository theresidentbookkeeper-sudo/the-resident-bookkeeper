// @ts-nocheck
// Bank statement reader: PDF text -> transactions, checked against the running balance.
// Shared by the workspace assistant (Deno) and local tests (Node).
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
const yr = (y) => { y = +y; return y < 100 ? 2000 + y : y; };
const DATE_RES = [
  [/^(\d{1,2})[-\/ .]([A-Za-z]{3,4})[-\/ .,]*(\d{2,4})\b/, (m) => MON[m[2].toLowerCase()] && `${yr(m[3])}-${pad(MON[m[2].toLowerCase()])}-${pad(m[1])}`],
  [/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/, (m) => `${m[1]}-${pad(m[2])}-${pad(m[3])}`],
  [/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/, (m) => +m[2] <= 12 ? `${yr(m[3])}-${pad(m[2])}-${pad(m[1])}` : `${yr(m[3])}-${pad(m[1])}-${pad(m[2])}`],
  [/^([A-Za-z]{3,4})[ .-](\d{1,2}),?[ .-](\d{2,4})\b/, (m) => MON[m[1].toLowerCase()] && `${yr(m[3])}-${pad(MON[m[1].toLowerCase()])}-${pad(m[2])}`],
];
function parseDate(s) {
  s = s.trim();
  for (const [re, f] of DATE_RES) { const m = s.match(re); if (m) { const d = f(m); if (d && !isNaN(Date.parse(d))) return { date: d, len: m[0].length }; } }
  return null;
}
const AMT = /\(?-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?(?:\s?(?:CR|DR|Cr|Dr))?/g;
const num = (s) => { const neg = /^\(|^-|DR$|Dr$/.test(s.trim()); const v = parseFloat(s.replace(/[^\d.]/g, "")); return neg ? -v : v; };
const near = (a, b) => Math.abs(a - b) < 0.015;

// items: [{str, x, y, page}] -> lines [{text, cells:[{str,x}]}]
export function toLines(items) {
  const lines = [];
  const byPage = {};
  for (const it of items) { if (!it.str.trim()) continue; (byPage[it.page] ||= []).push(it); }
  for (const p of Object.keys(byPage).sort((a, b) => a - b)) {
    const its = byPage[p].sort((a, b) => b.y - a.y || a.x - b.x);
    let cur = null;
    for (const it of its) {
      if (!cur || Math.abs(cur.y - it.y) > 2.5) { cur = { y: it.y, cells: [] }; lines.push(cur); }
      cur.cells.push({ str: it.str.trim(), x: it.x });
    }
  }
  for (const l of lines) { l.cells.sort((a, b) => a.x - b.x); l.text = l.cells.map((c) => c.str).join("  "); }
  return lines;
}

export function readStatement(lines) {
  let opening = null, closing = null, cols = null;
  const tx = [];
  let prev = null;
  for (const l of lines) {
    const t = l.text, low = t.toLowerCase();
    // Column headings tell us where money out / money in sit.
    if (/(debit|withdrawal|money out|paid out|\bdr\b)/i.test(t) && /(credit|deposit|lodgement|money in|paid in|\bcr\b)/i.test(t)) {
      const find = (re) => l.cells.find((c) => re.test(c.str));
      const o = find(/debit|withdraw|money out|paid out|^dr\b/i), i = find(/credit|deposit|lodg|money in|paid in|^cr\b/i), b = find(/balance/i);
      if (o && i) cols = { out: o.x, in: i.x, bal: b ? b.x : null };
      continue;
    }
    const amts = [...t.matchAll(AMT)].map((m) => ({ s: m[0], v: num(m[0]), i: m.index }));
    const after = (re) => { const m = low.match(re); if (!m) return []; return amts.filter((x) => x.i > m.index); };
    const op = after(/opening balance|balance b\/?f|brought forward|balance brought|previous balance/);
    const cl = after(/closing balance|balance c\/?f|carried forward/);
    if (op.length || cl.length) {
      if (op.length && opening == null) { opening = op[0].v; prev = opening; }
      if (cl.length) closing = cl.length >= 3 ? cl[cl.length - 1].v : cl[0].v;
      continue;
    }
    if (/^total/.test(low)) continue;
    const d = parseDate(t);
    if (!d) {
      // Continuation of the previous description (no date, no amounts).
      if (tx.length && !amts.length && t.length < 120 && !/page \d|statement|account (name|number)/i.test(t)) tx[tx.length - 1].description += " " + t.trim();
      continue;
    }
    if (!amts.length) continue;
    let rest = t.slice(d.len).trim();
    const d2 = parseDate(rest); if (d2) rest = rest.slice(d2.len).trim(); // value date column
    const firstAmt = rest.search(AMT);
    const description = (firstAmt > 0 ? rest.slice(0, firstAmt) : rest).replace(/\s{2,}/g, " ").trim();
    const hasBal = amts.length >= 2 || (cols && cols.bal);
    const bal = amts.length >= 2 ? amts[amts.length - 1].v : null;
    const cands = amts.length >= 2 ? amts.slice(0, -1) : amts;
    let out = 0, inn = 0, check = "";
    if (bal != null && prev != null) {
      const diff = +(bal - prev).toFixed(2);
      const m = cands.find((c) => near(Math.abs(c.v), Math.abs(diff)));
      if (m) { if (diff < 0) out = Math.abs(diff); else inn = Math.abs(diff); check = "agrees"; }
    }
    if (!check) {
      // Fall back to column position.
      const amtCells = l.cells.filter((c) => AMT.test(c.str) && (AMT.lastIndex = 0, true));
      AMT.lastIndex = 0;
      const c = (amtCells.length >= 2 ? amtCells.slice(0, -1) : amtCells)[0];
      const v = c ? Math.abs(num(c.str)) : Math.abs(cands[0].v);
      if (cols && c) { if (Math.abs(c.x - cols.out) < Math.abs(c.x - cols.in)) out = v; else inn = v; }
      else if (/\bCR\b/i.test(cands[0].s)) inn = v; else out = v;
      check = bal != null && prev != null ? "check" : "no balance";
    }
    tx.push({ date: d.date, description, out, in: inn, balance: bal, check });
    if (bal != null) prev = bal;
    if (opening == null && bal != null && tx.length === 1) opening = +(bal + out - inn).toFixed(2);
  }
  const totalOut = +tx.reduce((s, r) => s + r.out, 0).toFixed(2), totalIn = +tx.reduce((s, r) => s + r.in, 0).toFixed(2);
  const lastBal = [...tx].reverse().find((r) => r.balance != null)?.balance ?? null;
  const expected = opening != null ? +(opening + totalIn - totalOut).toFixed(2) : null;
  return { tx, opening, closing: closing ?? lastBal, totalIn, totalOut, agreeing: tx.filter((r) => r.check === "agrees").length,
    balanced: expected != null && (closing ?? lastBal) != null ? near(expected, closing ?? lastBal) : null, expected };
}

export async function pdfItems(getDocumentProxy, bytes) {
  const pdf = await getDocumentProxy(bytes);
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) if (it.str !== undefined) items.push({ str: it.str, x: it.transform[4], y: it.transform[5], page: p });
  }
  return items;
}
