import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Auth is by bearer token (no cookies), so any origin is safe here.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication required." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !publishableKey) return json({ error: "Supabase function configuration is incomplete." }, 500);
    const caller = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await caller.auth.getUser(token);
    if (error || !data.user) return json({ error: "Invalid session." }, 401);

    // Team only: the business owner or an active employee. Clients cannot use the AI proxy.
    const uid = data.user.id;
    const owner = await caller.from("profile").select("owner_id").eq("owner_id", uid).maybeSingle();
    let isTeam = !!owner.data?.owner_id;
    if (!isTeam) {
      const emp = await caller.from("employees").select("id").eq("portal_user_id", uid).eq("status", "Active").maybeSingle();
      isTeam = !!emp.data?.id;
    }
    if (!isTeam) return json({ error: "TRB team access is required." }, 403);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Nani is not configured yet. Add ANTHROPIC_API_KEY to this project's Edge Function secrets." }, 503);
    const body = await req.json();
    const system = typeof body?.system === "string" ? body.system.slice(0, 20000) : "";
    const messages = Array.isArray(body?.messages) ? body.messages.slice(-30) : [];
    if (!messages.length) return json({ error: "At least one message is required." }, 400);
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, system, messages }),
    });
    const responseBody = await upstream.json();
    return new Response(JSON.stringify(responseBody), { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected AI service error." }, 500);
  }
});
