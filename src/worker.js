// residentbookkeeper.com on Cloudflare: serves the website, and handles email sent to @residentbookkeeper.com.
// Email: every message is forwarded to Gmail first (so nothing is ever lost), then a copy goes to the portal's AI inbox.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
  async email(message, env, ctx) {
    const to = String(message.to || "").toLowerCase();
    const map = (() => { try { return JSON.parse(env.FORWARD_MAP || "{}"); } catch { return {}; } })();
    const dest = map[to] || env.FORWARD_TO;
    // 1. Forward to Gmail. If this fails the sender gets a bounce instead of mail silently disappearing.
    await message.forward(dest);
    // 2. Copy to the AI inbox (best effort; never blocks delivery).
    if (env.INBOX_TOKEN && env.INBOX_URL) {
      ctx.waitUntil((async () => {
        try {
          const raw = await new Response(message.raw).arrayBuffer();
          if (raw.byteLength > 6 * 1024 * 1024) return;
          await fetch(env.INBOX_URL, { method: "POST", headers: { "Content-Type": "message/rfc822", "x-inbox-token": env.INBOX_TOKEN, "x-mail-to": to, "x-mail-from": String(message.from || "") }, body: raw });
        } catch (e) { console.log("inbox copy failed", String(e)); }
      })());
    }
  },
};
