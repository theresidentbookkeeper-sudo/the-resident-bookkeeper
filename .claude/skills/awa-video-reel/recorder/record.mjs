// Record a website being used, as b-roll: smooth cursor moves, clicks, wheel scrolls, typing, with a visible cursor.
// usage: node record.mjs <script.json> <out.mp4>
// script.json: {"url": "https://...", "viewport": [1200, 860], "steps": [
//   {"wait": 800},
//   {"scroll": 900, "ms": 2200},                 // wheel-scroll whatever is under the cursor (a page or an open panel)
//   {"move": "Charts", "ms": 700},               // glide the cursor to an element (visible text, aria-label, or "css:<selector>")
//   {"click": "Charts"},                         // glide there and click
//   {"hover": "css:article video", "ms": 900},   // glide there and rest
//   {"reveal": "Copy", "ms": 900},               // scroll until the element is in view, then continue
//   {"type": "motion", "into": "css:input"}      // click a field and type
// ]}
// Uses the installed Chrome (CHROME_PATH to override), so H.264 videos on the page play.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const [scriptPath, out] = process.argv.slice(2);
const S = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const [W, H] = S.viewport || [1200, 860];
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('No Chrome or Edge found: set CHROME_PATH');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// a big arrow cursor with a click ripple, drawn into every page the recorder visits
const CURSOR = `(() => {
  const add = () => {
    if (document.getElementById('__er_cur')) return;
    const c = document.createElement('div'); c.id = '__er_cur';
    c.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.6 L11.7 21.5 L14.6 20.2 L11.6 13.5 L18 13.5 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none',
      transform: 'translate(-200px,-200px)', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.5))', transition: 'scale .12s'});
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 6) + 'px,' + (e.clientY - 3) + 'px)'; }, true);
    addEventListener('mousedown', (e) => {
      c.style.scale = '0.85';
      const r = document.createElement('div');
      Object.assign(r.style, {position: 'fixed', left: (e.clientX - 28) + 'px', top: (e.clientY - 28) + 'px', width: '56px', height: '56px',
        borderRadius: '50%', border: '3px solid rgba(255,255,255,.9)', boxShadow: '0 0 12px rgba(0,0,0,.35)', zIndex: '2147483646',
        pointerEvents: 'none', transition: 'transform .45s ease-out, opacity .45s ease-out', transform: 'scale(.3)', opacity: '1'});
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 500);
    }, true);
    addEventListener('mouseup', () => { c.style.scale = '1'; }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add); else add();
})();`;

// find an element by visible text / aria-label (or css:selector); returns its centre, scrolling it into view if asked
async function locate(page, q, reveal) {
  return page.evaluate((q, reveal) => {
    let el = null;
    if (q.startsWith('css:')) el = [...document.querySelectorAll(q.slice(4))].find((e) => e.getBoundingClientRect().width > 4);
    else {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const want = norm(q);
      let best = 1e9;
      for (const e of document.querySelectorAll('a,button,[role=button],[role=tab],input,textarea,label,h1,h2,h3,h4,span,p,li,div')) {
        if (e.id === '__er_cur') continue;
        const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
        const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
        const t = norm(e.getAttribute('aria-label')) || norm(e.innerText);
        if (!t.includes(want)) continue;
        const off = r.bottom < 0 || r.top > innerHeight ? 400 : 0;
        const score = (t === want ? 0 : 1000) + t.length + off + (['A', 'BUTTON'].includes(e.tagName) ? 0 : 5);
        if (score < best) { best = score; el = e; }
      }
    }
    if (!el) return null;
    if (reveal) el.scrollIntoView({behavior: 'smooth', block: 'center'});
    const r = el.getBoundingClientRect();
    return {x: r.left + r.width / 2, y: r.top + r.height / 2, inView: r.top >= 0 && r.bottom <= innerHeight};
  }, q, !!reveal);
}

let mx = W * 0.62, my = H * 0.7;
async function glide(page, x, y, ms = 650) {
  const n = Math.max(8, Math.round(ms / 16)), x0 = mx, y0 = my;
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n);
    // a slight arc reads as a hand, not a robot
    const arc = Math.sin(Math.PI * i / n) * Math.min(40, Math.hypot(x - x0, y - y0) * 0.08);
    await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k - arc);
    await sleep(ms / n);
  }
  mx = x; my = y;
}

async function target(page, q, ms) {
  let p = await locate(page, q, false);
  if (!p) throw new Error(`could not find "${q}" on ${page.url()}`);
  if (!p.inView) { p = await locate(page, q, true); await sleep(700); p = await locate(page, q, false); }
  await glide(page, p.x, p.y, ms);
  return p;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, defaultViewport: {width: W, height: H, deviceScaleFactor: 1},
  args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--mute-audio', `--window-size=${W},${H}`, '--lang=en-US'],
});
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(CURSOR);
  await page.goto(S.url, {waitUntil: 'networkidle2', timeout: 60000}).catch(() => {});
  await sleep(1500);
  // dismiss a cookie or consent banner if there is one, before recording starts
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,a,[role=button]')].find((e) => /^(accept( all)?|agree|i agree|got it|allow all|ok|okay)$/i.test((e.innerText || '').trim()));
    if (b) b.click();
  });
  await sleep(600);
  await page.mouse.move(mx, my);
  const rec = await page.screencast({path: out, format: 'mp4', fps: 30, quality: 18});
  await sleep(250);
  for (const s of S.steps || []) {
    if (s.wait) await sleep(s.wait);
    else if (s.scroll) {
      const ms = s.ms || 1800, n = Math.max(10, Math.round(ms / 16)); let done = 0;
      for (let i = 1; i <= n; i++) { const want = s.scroll * ease(i / n); await page.mouse.wheel({deltaY: want - done}); done = want; await sleep(ms / n); }
    } else if (s.move) await target(page, s.move, s.ms);
    else if (s.hover) { await target(page, s.hover, s.ms); await sleep(s.rest || 500); }
    else if (s.reveal) { await locate(page, s.reveal, true); await sleep(s.ms || 900); }
    else if (s.click) { await target(page, s.click, s.ms); await sleep(120); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(s.after || 700); }
    else if (s.type) {
      if (s.into) { await target(page, s.into, s.ms); await page.mouse.click(mx, my); }
      await page.keyboard.type(s.type, {delay: 70});
    }
  }
  await sleep(300);
  await rec.stop();
  console.log(JSON.stringify({ok: true, out, viewport: [W, H]}));
} finally {
  await browser.close();
}
