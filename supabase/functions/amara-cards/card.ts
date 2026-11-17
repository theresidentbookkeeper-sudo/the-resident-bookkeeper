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
export function buildCardSvg(card) {
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
