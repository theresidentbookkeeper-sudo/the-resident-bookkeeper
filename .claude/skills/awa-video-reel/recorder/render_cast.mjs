// Turn a recorded terminal session (cast.jsonl from claude_session.mjs) into an MP4, replaying the exact bytes
// through xterm.js in Chrome. A time map stretches or squeezes each stretch of the session, and an optional
// zoom pushes in on the input box.
// Usage: node render_cast.mjs <cast.jsonl> <plan.json> <out.mp4>
//   plan: {"w": 1024, "h": 738, "fps": 25, "font": 28, "bg": "#0C0C0C",
//          "segments": [[out0, out1, src0, src1], ...], "zoom": [[out0, out1, z0, z1], ...]}
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, 'package.json'));
const puppeteer = require('puppeteer-core');

const [castPath, planPath, outPath] = process.argv.slice(2);
const lines = fs.readFileSync(castPath, 'utf8').trim().split('\n');
const hdr = JSON.parse(lines[0]);
const chunks = lines.slice(1).map(l => JSON.parse(l));
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const { w, h, fps = 25, font = 28, bg = '#0C0C0C' } = plan;
const segs = plan.segments, zooms = plan.zoom || [];
const total = segs[segs.length - 1][1];
const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
const srcAt = t => { for (const [o0, o1, s0, s1] of segs) if (t <= o1) return s0 + (s1 - s0) * Math.max(0, (t - o0) / (o1 - o0)); return segs[segs.length - 1][3]; };
const zoomAt = t => { let z = 1; for (const [o0, o1, z0, z1] of zooms) { if (t >= o0) z = z0 + (z1 - z0) * ease((t - o0) / (o1 - o0)); } return z; };

const xtermDir = path.join(path.dirname(require.resolve('@xterm/xterm/package.json')));
const css = fs.readFileSync(path.join(xtermDir, 'css', 'xterm.css'), 'utf8');
const js = fs.readFileSync(path.join(xtermDir, 'lib', 'xterm.js'), 'utf8');
const CHROME = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>${css}
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg}}
  #cam{position:absolute;inset:0;transform-origin:50% 100%}
  #t{position:absolute;left:50%;top:50%}
  .xterm .xterm-viewport{overflow:hidden!important;background:${bg}!important}
</style></head><body><div id="cam"><div id="t"></div></div><script>${js}</script></body></html>`);
await page.evaluate(({ cols, rows, font, bg }) => {
  window.term = new Terminal({ cols, rows, fontFamily: 'Consolas, "Cascadia Mono", monospace', fontSize: font, lineHeight: 1.0,
    theme: { background: bg, foreground: '#E6E6E6', cursor: bg, cursorAccent: bg }, allowProposedApi: true, scrollback: 0, cursorBlink: false });
  term.open(document.getElementById('t'));
  const el = document.querySelector('#t .xterm-screen');
  const t = document.getElementById('t');
  t.style.marginLeft = -el.offsetWidth / 2 + 'px'; t.style.marginTop = -el.offsetHeight / 2 + 'px';
  window.feed = s => new Promise(r => term.write(s, () => requestAnimationFrame(() => requestAnimationFrame(r))));
}, { cols: hdr.cols, rows: hdr.rows, font, bg });

const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-crf', '14',
  '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', String(fps), outPath], { stdio: ['pipe', 'inherit', 'inherit'] });
let i = 0;
const n = Math.round(total * fps);
for (let f = 0; f < n; f++) {
  const t = f / fps, src = srcAt(t);
  let buf = ''; while (i < chunks.length && chunks[i][0] <= src) buf += chunks[i++][1];
  await page.evaluate(async ({ buf, z }) => { if (buf) await feed(buf); document.getElementById('cam').style.transform = `scale(${z})`; }, { buf, z: zoomAt(t) });
  ff.stdin.write(await page.screenshot({ type: 'png' }));
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.log('wrote', outPath, n, 'frames');
