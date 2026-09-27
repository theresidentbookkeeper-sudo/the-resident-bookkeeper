# The Resident Bookkeeper — Final Deployment Package

Branch: `bookslite-final-build`

## Public architecture
- `/` → public website
- `/platform` → secure Team / Client login
- Team users → Today command centre
- Managed clients → personal Client Dashboard
- Books Lite clients → dedicated Books Lite workspace

## Books Lite
- Nigeria only
- ₦100,000/year
- Up to 2 business bank accounts
- Up to 100 transactions/month
- Nigerian pricing page uses **Get Started**
- Get Started captures the prospect as a lead and routes into the existing Sales → quote → follow-up → invoice → Finance → onboarding flow
- Paid Books Lite clients are provisioned with a dedicated Books Lite workspace

## Netlify
Netlify publishing was intentionally left untouched. Deploy this branch manually when ready.

Use the existing site:
`the-resident-bookkeeper`

Do not add competing Business Hub routes or restore the old Books Hub/Business Hub architecture.

## Supabase
The project has been updated with:
- Books Lite product/access fields on leads and clients
- `client-access-provision` Edge Function v3
- secure paid-invoice access provisioning
- Books Lite workspace creation for paid Books Lite clients

The browser only uses the publishable Supabase key. Secret credentials remain server-side.

## Important
This package preserves the agreed framework. No production Netlify deployment was triggered from this build branch.
