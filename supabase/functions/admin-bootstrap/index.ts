// admin-bootstrap — ONE-TIME first-owner creation for the WOODEX Supabase project.
//
// Security model:
//   - Requires header `x-bootstrap-secret: <ADMIN_BOOTSTRAP_SECRET>` (>=16 chars, env-only).
//   - Uses the service-role key ONLY inside this function (never shipped to the bundle).
//   - `public.bootstrap_owner` raises once any user_roles row exists, and is revoked
//     from public/anon/authenticated — so this cannot be turned into a privilege mint.
//   - Pass rate: createUser + one row insert. Two parallel calls could both pass the
//     count==0 check before EITHER commits — both rows would be owner. It is a
//     single-operator, one-time ops tool; do not call it from any UI or CI job.
//
// NOT verified against a hosted project from the authoring environment (no Supabase
// network egress, no CLI). Treat as untested until applied on staging.
import { createClient } from "npm:@supabase/supabase-js@^2.57.4";
import { timingSafeEqual } from "node:crypto";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BOOTSTRAP_SECRET = Deno.env.get("ADMIN_BOOTSTRAP_SECRET");

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  if (!BOOTSTRAP_SECRET || BOOTSTRAP_SECRET.length < 16) {
    return json({ error: "ADMIN_BOOTSTRAP_SECRET is not configured (needs >= 16 characters)" }, 500);
  }

  const provided = Buffer.from(req.headers.get("x-bootstrap-secret") ?? "");
  const expected = Buffer.from(BOOTSTRAP_SECRET);
  const ok = provided.length === expected.length && timingSafeEqual(provided, expected);
  if (!ok) return json({ error: "unauthorized" }, 401);

  let body: { email?: string; password?: string; name?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }

  const { email, password, name } = body;
  if (!email || typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return json({ error: "a valid email is required" }, 400);
  }
  if (!password || typeof password !== "string" || password.length < 16) {
    return json({ error: "password must be at least 16 characters" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) refuse fast if a bootstrap already happened (the RPC enforces this too)
  const { data: existing, error: roleErr } = await admin.from("user_roles").select("user_id").limit(1);
  if (roleErr) return json({ error: "roles table missing — apply the migration first" }, 500);
  if (existing && existing.length > 0) return json({ error: "bootstrap already completed" }, 409);

  // 2) create the auth user (confirmed) — if the email exists, the RPC still refuses
  //    to grant a second owner because the count check runs inside it.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name ?? "Owner" },
  });
  if (createErr || !created.user) {
    return json({ error: createErr?.message ?? "could not create auth user" }, 400);
  }

  // 3) mint the single owner role atomically inside SQL
  const { error: rpcErr } = await admin.rpc("bootstrap_owner", {
    p_user: created.user.id,
    p_name: name ?? "Owner",
  });
  if (rpcErr) return json({ error: rpcErr.message }, 409);

  return json({ ok: true, user_id: created.user.id });
});
