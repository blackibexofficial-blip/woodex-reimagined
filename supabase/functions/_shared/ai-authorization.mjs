// Authentication and authorization are separate checks. The injected clients
// must validate the bearer with Supabase Auth, then query has_cap using the
// SAME user's bearer, not a service-role session.
export async function authorizeAiStaff(request, { getUser, hasCapability }) {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  if (!match) return { ok: false, status: 401 };
  const token = match[1];
  try {
    const { data, error } = await getUser(token);
    if (error) {
      // A rejected credential differs from an unavailable Auth service.
      return { ok: false, status: [400, 401, 403].includes(error.status) ? 401 : 503 };
    }
    const user = data?.user;
    if (!user?.id || user.deleted_at) return { ok: false, status: 401 };
    if (user.banned_until) {
      const until = Date.parse(user.banned_until);
      if (!Number.isFinite(until) || until > Date.now()) return { ok: false, status: 401 };
    }
    const capability = await hasCapability(token, 'crm.manage');
    if (capability.error || typeof capability.data !== 'boolean') return { ok: false, status: 503 };
    if (!capability.data) return { ok: false, status: 403 };
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, status: 503 };
  }
}
