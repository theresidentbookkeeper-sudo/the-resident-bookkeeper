# TRB deployment

- Public site: https://residentbookkeeper.com (and www.residentbookkeeper.com)
- Hosting: Cloudflare Workers static assets, Worker `the-resident-bookkeeper`, built automatically from the `main` branch of this repository (Workers Builds). Config: `wrangler.jsonc`; files excluded from upload: `.assetsignore`.
- Email: Cloudflare Email Routing sends every @residentbookkeeper.com address through the Worker (`src/worker.js`), which forwards to theresidentbookkeeper@gmail.com and copies each message to the portal Inbox. Outgoing email from the AI team uses Resend as info@residentbookkeeper.com.
- DNS: managed in Cloudflare (domain registered at Namecheap).
- Database, logins and server functions: Supabase project `njhohxhtqkktktngjflb`. Edge Functions include `trb-workforce`, `inbox-ingest`, `client-access-provision`, `employee-access-provision`, `growth-engine`, `agent-chat`, `bookslite-nora`.
- Supabase Auth URL configuration must point at the live site: Site URL `https://residentbookkeeper.com`; Redirect URLs `https://residentbookkeeper.com/**` and `https://www.residentbookkeeper.com/**`. Invite and password-reset links fall back to the Site URL when the redirect is not allowed, so a stale Site URL sends people to the wrong site. The home page forwards any login link that lands on it to /platform.
- Login emails (invites, password resets) go through custom SMTP: Resend, sender info@residentbookkeeper.com (set 12 Nov 2026).
- The previous Netlify site is retired; `netlify.toml` is kept only for reference.

Monthly target: 10 new clients across Nigeria, the United States, Canada, the United Kingdom and Australia, including Books Lite. It is an operating target, not a guarantee.
