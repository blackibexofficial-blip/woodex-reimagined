// The service role verifies identity and reserves usage. The capability RPC is
// deliberately performed using the caller's JWT and the public anon key, so
// has_cap derives auth.uid() from the same verified user, never service role.
export function createAiAuthDependencies({ createClient, url, serviceRoleKey, anonKey, fetchImpl }) {
  if (!url || !serviceRoleKey || !anonKey) return null;
  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const globalFetch = fetchImpl ? { fetch: fetchImpl } : {};
  const admin = createClient(url, serviceRoleKey, { auth, global: globalFetch });
  return {
    getUser: (token) => admin.auth.getUser(token),
    reserveUsage: (userId, userLimit, globalLimit) => admin.rpc('ai_usage_reserve', {
      p_user_id: userId, p_user_limit: userLimit, p_global_limit: globalLimit,
    }),
    hasCapability: (token, need) => {
      const caller = createClient(url, anonKey, {
        auth,
        global: { ...globalFetch, headers: { Authorization: `Bearer ${token}` } },
      });
      return caller.rpc('has_cap', { need });
    },
  };
}
