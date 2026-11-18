// residentbookkeeper.com on Cloudflare: serves the website (with guides from the database), and handles email sent to @residentbookkeeper.com.
// Email:
//   - addresses in GMAIL_ADDRESSES (info@) are forwarded to Gmail and copied to the portal inbox;
//   - every other address (the team's work email) goes to the portal inbox only.
//     If the portal cannot take it, it is forwarded to Gmail instead, so nothing is ever lost.
import { handleGuides } from "./guides.js";

export default {
  async fetch(request, env, ctx) {
    // Guides, the sitemap and llms.txt include guides from the portal database (see src/guides.js).
    const guides = await handleGuides(request, env, ctx);
    if (guides) return guides;
    return env.ASSETS.fetch(request);
  },
  async email(message, env, ctx) {
    const to = String(message.to || "").toLowerCase();
    const map = (() => { try { return JSON.parse(env.FORWARD_MAP || "{}"); } catch { return {}; } })();
    const dest = map[to] || env.FORWARD_TO;
    const toGmail = String(env.GMAIL_ADDRESSES || "info@residentbookkeeper.com").toLowerCase().split(",").map((s) => s.trim()).includes(to) || !!map[to];
    const token = env.INBOX_TOKEN || env.Inbox_Token || env.inbox_token;
    // Read the raw email first: once it has been forwarded the stream may already be used up.
    let raw = null;
    if (token && env.INBOX_URL) {
      try { raw = await new Response(message.raw).arrayBuffer(); } catch (e) { console.log("could not read email", String(e)); }
    } else {
      console.log("inbox copy skipped: INBOX_TOKEN secret or INBOX_URL missing");
    }
    const toPortal = async () => {
      if (!raw || raw.byteLength > 6 * 1024 * 1024) return false;
      try {
        const r = await fetch(env.INBOX_URL, { method: "POST", headers: { "Content-Type": "message/rfc822", "x-inbox-token": token, "x-mail-to": to, "x-mail-from": String(message.from || "") }, body: raw });
        console.log("inbox copy", to, r.status);
        return r.ok;
      } catch (e) { console.log("inbox copy failed", String(e)); return false; }
    };
    if (toGmail) {
      // Forward first: if this fails the sender gets a bounce instead of mail silently disappearing.
      await message.forward(dest);
      ctx.waitUntil(toPortal());
      return;
    }
    // Team work email: portal inbox only, Gmail as the safety net.
    if (!(await toPortal())) await message.forward(dest);
  },
};
