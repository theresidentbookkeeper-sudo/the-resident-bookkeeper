// Record a real Claude Code session in a pseudo-terminal, so it can be replayed as b-roll.
// It gets past the start-up questions (browser tools off, auto-mode setup not now, trust the empty folder),
// pastes the prompt, types the extra line (the person's own details) and presses Enter. It never
// approves a tool: recording stops at the first permission prompt or after work_seconds.
// Every byte the terminal prints is saved with its time (cast.jsonl), plus the key moments (events.json).
// Usage: node claude_session.mjs <session.json>
//   {"cwd": "...", "prompt": "...", "extra": "...", "cols": 86, "rows": 33, "work_seconds": 3,
//    "args": [...extra claude CLI args], "out_dir": "..."}
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
const require = createRequire(import.meta.url);
const pty = require('@lydell/node-pty');
const { Terminal } = require('@xterm/headless');

const ESC = '\x1b', CR = '\r', CTRL_U = '\x15', CTRL_C = '\x03';
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const cols = cfg.cols || 86, rows = cfg.rows || 33;
fs.mkdirSync(cfg.cwd, { recursive: true });
fs.mkdirSync(cfg.out_dir, { recursive: true });
const cast = fs.createWriteStream(path.join(cfg.out_dir, 'cast.jsonl'));
cast.write(JSON.stringify({ cols, rows }) + '\n');

const exe = process.platform === 'win32' ? path.join(os.homedir(), '.local', 'bin', 'claude.exe') : 'claude';
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 });
const p = pty.spawn(exe, cfg.args || [], {
  name: 'xterm-256color', cols, rows, cwd: cfg.cwd,
  env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '3' },
});
let last = now();
p.onData(d => { cast.write(JSON.stringify([+now().toFixed(3), d]) + '\n'); term.write(d); last = now(); });
let exited = false;
p.onExit(() => { exited = true; });

const screen = () => { const b = term.buffer.active; let s = ''; for (let i = 0; i < rows; i++) s += (b.getLine(b.viewportY + i)?.translateToString(true) || '') + '\n'; return s; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const events = { started: 0, cols, rows };
const log = (k, v) => { events[k] = v ?? +now().toFixed(3); console.log(k, events[k]); };
const send = s => p.write(s);

// 1. start-up questions, then an empty input. The welcome box shows the account's email: the replay blanks it.
const startEnd = Date.now() + 90000;
while (Date.now() < startEnd) {
  await sleep(500);
  const s = screen();
  if (/Claude in Chrome/i.test(s) && /Esc to keep/i.test(s)) { send(ESC); log('chrome_dialog_off'); await sleep(1200); continue; }
  if (/Do you trust/i.test(s)) { send(CR); log('trusted'); await sleep(1200); continue; }
  if (/Set up auto mode/i.test(s) && /Esc to cancel/i.test(s)) { send(ESC); log('auto_setup_dismissed'); await sleep(1200); continue; }
  if (/auto mode on|for shortcuts|accept edits on|bypass permissions on/i.test(s) && now() - last > 1.5) break;
}
for (let k = 0; k < 3; k++) { send(CTRL_U); await sleep(150); }   // empty a prefilled input line
await sleep(1200);

// 2. paste the prompt (bracketed paste, as a real Ctrl+V does), type the extra line, press Enter
if (/[\w.-]+@[\w-]+\.[\w.]+/.test(screen())) { events.email_on_screen = true; console.log('an email address is on screen'); }
log('paste'); send(ESC + '[200~' + cfg.prompt + ESC + '[201~');
await sleep(1500);
log('type_start');
for (const ch of cfg.extra || '') { send(ch); await sleep(55); }
log('type_end');
await sleep(900);
log('enter'); send(CR);

// 3. record Claude starting; stop at the first permission prompt (never approve) or after work_seconds
const stopAt = Date.now() + (cfg.work_seconds || 90) * 1000;
while (!exited && Date.now() < stopAt) {
  await sleep(300);
  if (/Do you want to/i.test(screen())) { log('permission_prompt'); break; }
}
log('done');
fs.writeFileSync(path.join(cfg.out_dir, 'final_screen.txt'), screen());
send(ESC); await sleep(400); send(CTRL_C); await sleep(400); send(CTRL_C);
await sleep(1500);
try { p.kill(); } catch {}
cast.end();
events.duration = +now().toFixed(1);
fs.writeFileSync(path.join(cfg.out_dir, 'events.json'), JSON.stringify(events, null, 1));
process.exit(0);
