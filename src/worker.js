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
    const token = env.INBOX_TOKEN || env.Inbox_Token || env.inbox_token;
    // Read the raw email first: once it has been forwarded the stream may already be used up.
    let raw = null;
    if (token && env.INBOX_URL) {
      try { raw = await new Response(message.raw).arrayBuffer(); } catch (e) { console.log("could not read email", String(e)); }
    } else {
      console.log("inbox copy skipped: INBOX_TOKEN secret or INBOX_URL missing");
    }
    // 1. Forward to Gmail. If this fails the sender gets a bounce instead of mail silently disappearing.
    await message.forward(dest);
    // 2. Copy to the AI inbox (best effort; never blocks delivery).
    if (raw && raw.byteLength <= 6 * 1024 * 1024) {
      ctx.waitUntil((async () => {
        try {
          const r = await fetch(env.INBOX_URL, { method: "POST", headers: { "Content-Type": "message/rfc822", "x-inbox-token": token, "x-mail-to": to, "x-mail-from": String(message.from || "") }, body: raw });
          console.log("inbox copy", r.status);
        } catch (e) { console.log("inbox copy failed", String(e)); }
      })());
    }
  },
};
