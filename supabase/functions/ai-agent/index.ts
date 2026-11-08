// Staff-only AI proxy. No hosted deployment is made by this repository change.
// Identity is checked with Auth, then crm.manage is checked with the caller JWT.
// IMPORTANT: grounding is still supplied by the caller. Usage quotas are not
// a provider budget or privacy review. Do not enable hosted AI until all safety
// controls are implemented and verified in staging. Offline drafts are separate.
import { createClient } from "npm:@supabase/supabase-js@^2.57.4";
import { createAiAgentHandler } from "./handler.mjs";
import { createAiAuthDependencies } from "./supabase-auth.mjs";

const authDependencies = createAiAuthDependencies({
  createClient,
  url: Deno.env.get("SUPABASE_URL"),
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
  fetchImpl: undefined,
});

Deno.serve(createAiAgentHandler({
  apiKey: Deno.env.get("AI_AGENT_API_KEY"),
  baseUrl: Deno.env.get("AI_AGENT_BASE_URL") ?? "https://api.openai.com/v1",
  model: Deno.env.get("AI_AGENT_MODEL") ?? "gpt-4o-mini",
  getUser: authDependencies?.getUser,
  hasCapability: authDependencies?.hasCapability,
  reserveUsage: authDependencies?.reserveUsage,
  userLimit: Deno.env.get("AI_AGENT_USER_LIMIT_10M"),
  globalLimit: Deno.env.get("AI_AGENT_GLOBAL_LIMIT_24H"),
}));
