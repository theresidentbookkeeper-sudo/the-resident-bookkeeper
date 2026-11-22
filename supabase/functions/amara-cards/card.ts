// @ts-nocheck
// Amara's text cards: the same look as the Manus visuals without the picture.
// Cream background, TRB black / red / gold, brand name and tagline only. 1080 x 1350 (Instagram 4:5).
// buildCardSvg is pure (shared with local tests); renderCard turns it into a PNG with resvg.
const W = 1080, H = 1350, X = 104, MAXW = W - 2 * X;
const C = { bg: "#F8F2E7", line: "#E4D6BC", ink: "#14110E", body: "#2B2520", red: "#B8112B", gold: "#A67C1E", mute: "#6B6052" };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Rough Inter widths (em per character) – good enough to wrap safely.
const width = (s, size, bold) => [...s].reduce((w, ch) => w + (/[ il.,'’:;!|]/.test(ch) ? 0.28 : /[mwMW@₦]/.test(ch) ? 0.84 : /[A-Z0-9]/.test(ch) ? 0.64 : 0.5) * (bold ? 1.06 : 1), 0) * size;
function wrap(text, size, max, bold, maxLines = 6) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
  const out = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (width(t, size, bold) <= max || !cur) cur = t; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S+$/, "") + "…"; }
  return out;
}
// TRB has ONE phone / WhatsApp number for every market. Any other number an AI writes is replaced.
export const TRB_PHONE = "+234 802 600 0078";
export function fixPhones(text) {
  return String(text ?? "")
    .replace(/wa\.me\/\+?(\d{7,15})/g, (m, d) => (d === "2348026000078" ? m : "wa.me/2348026000078"))
    .replace(/\+?\(?\d[\d\s().-]{7,}\d/g, (m) => {
      const d = m.replace(/\D/g, "");
      if (d.length < 9 || /^\d{4}-\d{2}-\d{2}/.test(m.trim())) return m; // amounts, years, dates
      return d.endsWith("8026000078") ? m : TRB_PHONE;
    });
}
const wrapPlain = (text, size, max, bold, maxLines) => wrap(text, size, max, bold, maxLines);
// Price card: plan name, who it suits, the price in a panel, what is included, the note, button + WhatsApp number.
function buildPriceSvg(card) {
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  parts.push(`<rect x="36" y="36" width="${W - 72}" height="${H - 72}" rx="6" fill="none" stroke="${C.line}" stroke-width="2"/>`);
  parts.push(`<text x="${X}" y="140" font-family="Inter" font-weight="700" font-size="26" letter-spacing="7" fill="${C.gold}">THE RESIDENT BOOKKEEPER</text>`);
  parts.push(`<rect x="${X}" y="164" width="72" height="5" fill="${C.red}"/>`);
  if (card.market) parts.push(`<text x="${W - X}" y="140" text-anchor="end" font-family="Inter" font-weight="700" font-size="24" letter-spacing="4" fill="${C.mute}">${esc(String(card.market).toUpperCase())}</text>`);
  let y = 248;
  parts.push(`<text x="${X}" y="${y}" font-family="Inter" font-weight="700" font-size="28" letter-spacing="4" fill="${C.red}">${esc(String(card.kicker || "PRICING").toUpperCase())}</text>`);
  y += 82;
  parts.push(`<text x="${X}" y="${y}" font-family="Inter" font-weight="700" font-size="76" fill="${C.ink}">${esc(card.plan)}</text>`);
  y += 24;
  const suits = wrapPlain(card.suits || "", 34, MAXW, false, 2);
  suits.forEach((l) => { y += 46; parts.push(`<text x="${X}" y="${y}" font-family="Inter" font-weight="400" font-size="34" fill="${C.body}">${esc(l)}</text>`); });
  // Price panel
  y += 40;
  const price = String(card.price || ""), per = String(card.per || "");
  const custom = !/\d/.test(price);
  const ps = custom ? 96 : price.length > 6 ? 112 : 136;
  parts.push(`<rect x="${X}" y="${y}" width="${MAXW}" height="180" rx="18" fill="#FFFDF8" stroke="${C.line}" stroke-width="2"/>`);
  parts.push(`<text x="${X + 44}" y="${y + 90 + ps * 0.36}" font-family="Inter" font-weight="700" font-size="${ps}" fill="${C.red}">${esc(price)}${per ? `<tspan font-weight="500" font-size="40" fill="${C.mute}" dx="12">${esc(per)}</tspan>` : ""}</text>`);
  y += 180 + 50;
  const items = (card.lines || []).slice(0, 5);
  items.forEach((t) => {
    const lines = wrapPlain(t, 32, MAXW - 76, false, 2);
    const b1 = y + 32, cy = b1 - 11;
    parts.push(`<circle cx="${X + 21}" cy="${cy}" r="21" fill="${C.red}"/><path d="M ${X + 11} ${cy + 1} l 7 8 l 14 -16" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`);
    lines.forEach((l, j) => parts.push(`<text x="${X + 68}" y="${b1 + j * 42}" font-family="Inter" font-weight="400" font-size="32" fill="${C.body}">${esc(l)}</text>`));
    y += Math.max(48, lines.length * 42) + 14;
  });
  if (card.note) { y += 6; wrapPlain(card.note, 26, MAXW, false, 2).forEach((l) => { y += 34; parts.push(`<text x="${X}" y="${y}" font-family="Inter" font-weight="500" font-size="26" fill="${C.mute}">${esc(l)}</text>`); }); }
  // Button + number, kept above the tagline
  const by = Math.min(Math.max(y + 36, 1010), H - 232);
  const btn = String(card.button || "Get Started").slice(0, 24);
  const bw = width(btn, 34, true) + 96;
  parts.push(`<rect x="${X}" y="${by}" width="${bw}" height="88" rx="12" fill="${C.red}"/>`);
  parts.push(`<text x="${X + bw / 2}" y="${by + 56}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="34" fill="#fff">${esc(btn)}</text>`);
  parts.push(`<text x="${X + bw + 32}" y="${by + 38}" font-family="Inter" font-weight="500" font-size="24" fill="${C.mute}">Call or WhatsApp</text>`);
  parts.push(`<text x="${X + bw + 32}" y="${by + 74}" font-family="Inter" font-weight="700" font-size="32" fill="${C.ink}">${TRB_PHONE}</text>`);
  parts.push(`<text x="${W / 2}" y="${H - 92}" text-anchor="middle" font-family="Inter" font-weight="500" font-size="25" letter-spacing="2" fill="${C.mute}">Accurate Records. Smarter Decisions. Stronger Business.</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}
export function buildCardSvg(card) {
  card = JSON.parse(fixPhones(JSON.stringify(card || {})));
  if (card.style === "price") return buildPriceSvg(card);
  const style = ["steps", "options"].includes(card.style) ? card.style : "checklist";
  let hs = 70; let head = wrap(card.headline, hs, MAXW, true, 5);
  if (head.length > 3) { hs = 60; head = wrap(card.headline, hs, MAXW, true, 5); }
  const items = (card.lines || []).map((t) => String(t).replace(/^\s*(?:[A-Da-d1-9][.):]|[-•✔✓])\s+/, "").replace(/\.$/, "")).filter(Boolean).slice(0, 4);
  const ls = items.length > 3 ? 36 : 40;
  const itemLines = items.map((t) => wrap(t, ls, MAXW - 84, false, 3));
  const btn = String(card.button || "Learn More").slice(0, 28);
  // Heights
  const kickerH = card.kicker ? 64 : 0;
  const headH = head.length * hs * 1.16;
  const itemsH = itemLines.reduce((h, l) => h + Math.max(56, l.length * ls * 1.3) + 26, 0);
  const total = kickerH + headH + 56 + itemsH + 40 + 96;
  let y = Math.max(250, 250 + (900 - total) / 2);
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  parts.push(`<rect x="36" y="36" width="${W - 72}" height="${H - 72}" rx="6" fill="none" stroke="${C.line}" stroke-width="2"/>`);
  parts.push(`<text x="${X}" y="140" font-family="Inter" font-weight="700" font-size="26" letter-spacing="7" fill="${C.gold}">THE RESIDENT BOOKKEEPER</text>`);
  parts.push(`<rect x="${X}" y="164" width="72" height="5" fill="${C.red}"/>`);
  if (card.kicker) { parts.push(`<text x="${X}" y="${y + 30}" font-family="Inter" font-weight="700" font-size="28" letter-spacing="4" fill="${C.red}">${esc(String(card.kicker).toUpperCase().slice(0, 40))}</text>`); y += kickerH; }
  head.forEach((l, i) => parts.push(`<text x="${X}" y="${y + hs * (i + 0.9) * 1.16}" font-family="Inter" font-weight="700" font-size="${hs}" fill="${C.ink}">${esc(l)}</text>`));
  y += headH + 56;
  itemLines.forEach((lines, i) => {
    const h = Math.max(56, lines.length * ls * 1.3);
    const b1 = y + ls * 1.05, cy = b1 - ls * 0.36;
    if (style === "checklist") parts.push(`<circle cx="${X + 26}" cy="${cy}" r="26" fill="${C.red}"/><path d="M ${X + 14} ${cy + 1} l 8 9 l 17 -19" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
    else if (style === "steps") parts.push(`<circle cx="${X + 26}" cy="${cy}" r="26" fill="${C.red}"/><text x="${X + 26}" y="${cy + 11}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="30" fill="#fff">${i + 1}</text>`);
    else parts.push(`<circle cx="${X + 26}" cy="${cy}" r="25" fill="none" stroke="${C.red}" stroke-width="4"/><text x="${X + 26}" y="${cy + 11}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="28" fill="${C.red}">${"ABCD"[i]}</text>`);
    lines.forEach((l, j) => parts.push(`<text x="${X + 84}" y="${b1 + j * ls * 1.3}" font-family="Inter" font-weight="400" font-size="${ls}" fill="${C.body}">${esc(l)}</text>`));
    y += h + 26;
  });
  y += 40;
  const bw = Math.min(MAXW, width(btn, 34, true) + 96);
  parts.push(`<rect x="${X}" y="${y}" width="${bw}" height="92" rx="12" fill="${C.red}"/>`);
  parts.push(`<text x="${X + bw / 2}" y="${y + 58}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="34" fill="#fff">${esc(btn)}</text>`);
  parts.push(`<text x="${W / 2}" y="${H - 92}" text-anchor="middle" font-family="Inter" font-weight="500" font-size="25" letter-spacing="2" fill="${C.mute}">Accurate Records. Smarter Decisions. Stronger Business.</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}
