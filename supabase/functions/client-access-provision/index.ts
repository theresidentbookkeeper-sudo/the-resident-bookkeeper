import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_ORIGIN = "https://residentbookkeeper.com";
// Auth is by bearer token (no cookies), so any origin is safe here.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication required." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!;
    const callerClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !callerData.user) return json({ error: "Invalid session." }, 401);

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    let authorized = false;
    const { data: ownerProfile } = await admin.from("profile")
      .select("owner_id").eq("owner_id", callerData.user.id).maybeSingle();
    if (ownerProfile?.owner_id) {
      authorized = true;
    } else {
      const { data: employee } = await admin.from("employees")
        .select("id,status,portal_user_id")
        .eq("portal_user_id", callerData.user.id)
        .eq("status", "Active").maybeSingle();
      authorized = !!employee;
    }
    if (!authorized) return json({ error: "Only authorized TRB team members can provision client access." }, 403);

    const body = await req.json();
    const clientId = body?.client_id, invoiceId = body?.invoice_id;
    if (!clientId || !invoiceId) return json({ error: "client_id and invoice_id are required." }, 400);

    const { data: invoice } = await admin.from("invoices")
      .select("id,client_id,status,amount,description").eq("id", invoiceId).maybeSingle();
    if (!invoice) return json({ error: "Invoice not found." }, 404);
    if (invoice.client_id !== clientId) return json({ error: "Invoice/client mismatch." }, 400);
    if (invoice.status !== "Paid") return json({ error: "Client access can only be provisioned after payment is confirmed and the invoice is Paid." }, 409);

    const { data: client } = await admin.from("clients").select("*").eq("id", clientId).maybeSingle();
    if (!client) return json({ error: "Client not found." }, 404);
    if (!client.email) return json({ error: "Client email is required before portal access can be provisioned." }, 400);

    const productCode = client.product_code || "MANAGED_BOOKKEEPING";
    const isBookslite = productCode === "BOOKSLITE";
    let userId = client.portal_user_id || null;
    let invited = false;

    if (!userId) {
      const { data: existingUser } = await admin.auth.admin.getUserByEmail(client.email);
      if (existingUser?.user) {
        userId = existingUser.user.id;
      } else {
        const { data: invitedUser, error: inviteError } = await admin.auth.admin.inviteUserByEmail(client.email, {
          data: { name: client.contact_name || client.name, trb_product: productCode },
          redirectTo: `${SITE_ORIGIN}/platform`
        });
        if (inviteError || !invitedUser?.user)
          return json({ error: inviteError?.message || "Could not send the client invitation." }, 500);
        userId = invitedUser.user.id;
        invited = true;
      }
    }

    await admin.from("clients").update({
      portal_user_id: userId,
      access_type: isBookslite ? "bookslite" : "managed_client",
      product_code: productCode,
      product_name: isBookslite ? "TRB Books Lite" : (client.product_name || "Managed Bookkeeping")
    }).eq("id", client.id);

    if (isBookslite) {
      const { data: existingBusiness } = await admin.from("books_lite_businesses")
        .select("id").eq("owner_id", userId).maybeSingle();
      const payload = {
        owner_id: userId, business_name: client.name, country_code: "NG", currency_code: "NGN",
        plan_code: "BOOKSLITE", subscription_status: "active",
        subscription_started_at: new Date().toISOString(),
        max_bank_accounts: 2, max_monthly_transactions: 100
      };
      if (!existingBusiness) {
        const { error } = await admin.from("books_lite_businesses").insert(payload);
        if (error) return json({ error: "Client access was linked, but the Books Lite workspace could not be created: " + error.message }, 500);
      } else {
        await admin.from("books_lite_businesses").update(payload).eq("id", existingBusiness.id);
      }
    }

    const onboardingMessage = isBookslite
      ? `Subject: Welcome to TRB Books Lite — your account is ready

Dear ${client.contact_name || client.name},

Thank you for choosing The Resident Bookkeeper.

Your payment has been confirmed and your TRB Books Lite access has now been prepared.

Your next step:
1. Open ${SITE_ORIGIN}/platform
2. Sign in using the email address you provided.
3. If this is your first login, use the invitation email to set your password.
4. After login, you will be taken directly to your personal Books Lite dashboard.

Your Books Lite workspace is designed for up to 2 business bank accounts and up to 100 transactions per month.

How Books Lite works:
• Upload your monthly bank statement(s).
• Nora, the Books Lite bookkeeping assistant, processes and categorises the transactions.
• Review any items that need your attention.
• Reconcile the bank activity.
• View or download your monthly reports.

Please keep your bank statements complete and readable, and use the dashboard whenever you are ready to submit the next month's records.

If you need help or your business grows beyond the Books Lite limits, contact The Resident Bookkeeper and we will help you choose the next step.

Accurate Records • Smarter Decisions • Stronger Business.

The Resident Bookkeeper`
      : `Subject: Welcome to The Resident Bookkeeper Client Portal

Dear ${client.contact_name || client.name},

Thank you for choosing The Resident Bookkeeper.

Your payment has been confirmed and your secure client portal access has now been prepared.

Your next step:
1. Open ${SITE_ORIGIN}/platform
2. Sign in using the email address you provided.
3. If this is your first login, use the invitation email to set your password.

Inside your client dashboard you will be able to view your invoices, shared reports and requested documents, and upload documents securely for your bookkeeping work.

We will follow up with any additional onboarding information we need from you.

Accurate Records • Smarter Decisions • Stronger Business.

The Resident Bookkeeper`;

    return json({ ok: true, invited, product_code: productCode,
      access_type: isBookslite ? "bookslite" : "managed_client", user_id: userId, onboarding_message: onboardingMessage });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected provisioning error." }, 500);
  }
});
