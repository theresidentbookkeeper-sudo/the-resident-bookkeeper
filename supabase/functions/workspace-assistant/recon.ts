// @ts-nocheck
// Bank-to-books reconciliation: reads a ledger / cash book table and matches it to bank statement lines.
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
export function toDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return d.toISOString().slice(0, 10); }
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/); if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return +m[2] <= 12 ? `${y}-${pad(m[2])}-${pad(m[1])}` : `${y}-${pad(m[1])}-${pad(m[2])}`; }
  m = s.match(/^(\d{1,2})[-\/ .]([A-Za-z]{3,4})[-\/ .,]*(\d{2,4})/); if (m && MON[m[2].toLowerCase()]) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${pad(MON[m[2].toLowerCase()])}-${pad(m[1])}`; }
  m = s.match(/^([A-Za-z]{3,4})[ .-](\d{1,2}),?[ .-](\d{4})/); if (m && MON[m[1].toLowerCase()]) return `${m[3]}-${pad(MON[m[1].toLowerCase()])}-${pad(m[2])}`;
  return null;
}
const num = (v) => { if (v == null || v === "") return 0; if (typeof v === "number") return v; const s = String(v).trim(); const neg = /^\(|^-|dr$/i.test(s); const n = parseFloat(s.replace(/[^\d.]/g, "")); return isNaN(n) ? 0 : neg ? -n : n; };

const IN = /^(money in|receipts?|deposits?|paid in|inflows?|credit amount|lodgements?|in)$|money in|receipt|deposit|paid in|inflow/;
const OUT = /^(money out|payments?|withdrawals?|paid out|outflows?|out)$|money out|payment|withdrawal|paid out|outflow/;
// Read a ledger/cash book/bank sheet (array of rows) into lines {date, desc, amount(+in/-out), account}.
export function readTable(rows, sheetName = "") {
  let h = -1, cols = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = (rows[i] || []).map((x) => norm(x));
    const date = r.findIndex((x) => /^(date|txn date|transaction date|trans date|posting date|value date)$/.test(x) || /^date/.test(x));
    if (date < 0) continue;
    const find = (re) => r.findIndex((x) => re.test(x));
    const desc = find(/details|description|narration|narrative|memo|particulars|payee|transaction details|name/);
    const inn = find(IN), out = find(OUT);
    const debit = find(/^debit|^dr$|debit amount/), credit = find(/^credit|^cr$|credit amount/);
    const amount = find(/^amount|^value|^net amount|^total/);
    const account = find(/^account|category|what it is|^ledger|^type$/);
    if (inn >= 0 || out >= 0 || debit >= 0 || credit >= 0 || amount >= 0) { h = i; cols = { date, desc, inn, out, debit, credit, amount, account }; break; }
  }
  if (h < 0) return null;
  const lines = [];
  const kind = cols.inn >= 0 || cols.out >= 0 ? "in/out" : cols.debit >= 0 || cols.credit >= 0 ? "debit/credit" : "amount";
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const date = toDate(r[cols.date]);
    if (!date) continue;
    let amt = 0;
    if (cols.inn >= 0 || cols.out >= 0) { amt = num(r[cols.inn]) - num(r[cols.out]); }
    else if (cols.debit >= 0 || cols.credit >= 0) { amt = num(r[cols.debit]) - num(r[cols.credit]); }
    else { amt = num(r[cols.amount]); }
    if (!amt) continue;
    lines.push({ date, desc: String(r[cols.desc] ?? "").trim(), amount: +amt.toFixed(2), account: cols.account >= 0 ? String(r[cols.account] ?? "").trim() : "", row: i + 1, sheet: sheetName });
  }
  return { lines, kind };
}

const dd = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
function match(bank, books, sign) {
  const B = bank.map((x, i) => ({ ...x, i, m: null })), L = books.map((x, i) => ({ ...x, amount: +(x.amount * sign).toFixed(2), i, m: null }));
  for (const win of [0, 3, 10]) {
    for (const b of B) {
      if (b.m) continue;
      let best = null;
      for (const l of L) { if (l.m || Math.abs(l.amount - b.amount) > 0.01) continue; const d = dd(l.date, b.date); if (d <= win && (!best || d < best.d)) best = { l, d }; }
      if (best) { b.m = best.l; best.l.m = b; b.days = best.d; }
    }
  }
  return { B, L, n: B.filter((b) => b.m).length };
}

// bank: [{date, desc, amount}] ; books: [{date, desc, amount, account}]
export function reconcile(bank, books) {
  const from = bank.reduce((a, b) => (a < b.date ? a : b.date), "9999"), to = bank.reduce((a, b) => (a > b.date ? a : b.date), "0000");
  const inside = books.filter((l) => l.date >= from && l.date <= to), outside = books.filter((l) => l.date < from || l.date > to);
  // Books may record money in as a credit (e.g. a sales ledger): use whichever sign matches better.
  const a = match(bank, inside, 1), b = match(bank, inside, -1);
  const r = b.n > a.n ? { ...b, flipped: true } : { ...a, flipped: false };
  const sum = (xs) => +xs.reduce((s, x) => s + x.amount, 0).toFixed(2);
  const matched = r.B.filter((x) => x.m);
  const bankOnly = r.B.filter((x) => !x.m), booksOnly = r.L.filter((x) => !x.m);
  // Likely duplicates in the books: same date, amount and description.
  const seen = new Map(), dups = [];
  for (const l of r.L) { const k = l.date + "|" + l.amount + "|" + norm(l.desc); if (seen.has(k)) dups.push(l); else seen.set(k, l); }
  const suspense = r.L.filter((l) => /suspense|uncategori[sz]ed|ask my accountant|unknown|misc/i.test(l.account + " " + l.desc));
  // Same transaction recorded with a different amount: close dates and a shared word in the description.
  const words = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 3 && !/^(paid|payment|transfer|from|with|bank|charges?|nip|pos)$/.test(w)));
  const pairs = [], usedB = new Set(), usedL = new Set();
  for (const bo of bankOnly) for (const lo of booksOnly) {
    if (usedB.has(bo) || usedL.has(lo) || Math.sign(bo.amount) !== Math.sign(lo.amount) || dd(bo.date, lo.date) > 3) continue;
    const wb = words(bo.desc); if ([...words(lo.desc)].some((w) => wb.has(w))) { pairs.push({ bank: bo, books: lo, diff: +(bo.amount - lo.amount).toFixed(2) }); usedB.add(bo); usedL.add(lo); }
  }
  // Months in the books with no bank statement to check against.
  const bankMonths = new Set(r.B.map((x) => x.date.slice(0, 7)));
  const gapMonths = [...new Set(r.L.map((x) => x.date.slice(0, 7)))].filter((m) => !bankMonths.has(m)).sort();
  return {
    pairs, gapMonths,
    bankOnly: bankOnly.filter((x) => !usedB.has(x)), booksOnly: booksOnly.filter((x) => !usedL.has(x) && !gapMonths.includes(x.date.slice(0, 7))),
    gapLines: booksOnly.filter((x) => gapMonths.includes(x.date.slice(0, 7))),
    from, to, flipped: r.flipped,
    bankIn: sum(r.B.filter((x) => x.amount > 0)), bankOut: -sum(r.B.filter((x) => x.amount < 0)), bankNet: sum(r.B),
    booksIn: sum(r.L.filter((x) => x.amount > 0)), booksOut: -sum(r.L.filter((x) => x.amount < 0)), booksNet: sum(r.L),
    matched, outside, dups, suspense,
    dateDiffs: matched.filter((x) => x.days > 0),
  };
}
