-- 20261107000006_lead_rate_limit — fixed-window guard for the ONLY public
-- lead intake path (lead-capture EF). Mirrors migration 0005's pattern.
--
-- The EF stamps p_key from the edge x-forwarded-for (client values discarded
-- at the EF). Missing key buckets as 'unknown'. Exceeded => count > p_limit;
-- the EF maps that to 429. This is a FIRST line of defense, not a sovereign
-- wall: the key is spoofable, and lead spam is far less destructive than
-- order-stock depletion — but 'intentionally unmonitored' is not acceptable
-- for an anonymous write path either. A WAF rule / Upstash global counter
-- remains the owner's production decision (see HOSTED-DEPLOY-RUNBOOK §8).
--
-- Storage: RLS-locked table, no client grants. The gating RPC is
-- service_role-only — anon/authenticated CANNOT invoke it (verified in
-- rehearsal). The EF calls it BEFORE the insert; on RPC failure the EF
-- fails OPEN (logs) so a missing migration degrades to today's behavior
-- instead of silently dropping leads — documented in the EF header.

-- The hosted database already provides these; this makes the migration
-- apply cleanly on a bare rehearsal database as well.
do $$ begin
  begin create role service_role nologin; exception when duplicate_object then null; end;
end $$;

create table if not exists public.lead_rate_limits (
  key text primary key,
  bucket_time timestamptz not null default now(),
  count integer not null default 0
);
alter table public.lead_rate_limits enable row level security;
-- intentionally NO policies: no client-facing reach at all.

create or replace function public.lead_rate_limit_hit(
  p_key text,
  p_limit int default 20,
  p_window_minutes int default 10
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_count int;
begin
  v_key := nullif(left(regexp_replace(coalesce(p_key, ''), '[^A-Za-z0-9._-]', '', 'g'), 64), '');
  v_key := coalesce(v_key, 'unknown');
  if p_limit is null or p_limit < 1 then raise exception 'lead_rate_limit_hit: p_limit invalid'; end if;
  insert into public.lead_rate_limits as rl (key, bucket_time, count)
  values (v_key, now(), 1)
  on conflict (key) do update
     set count = case when rl.bucket_time < now() - (least(p_window_minutes, 1440) || ' minutes')::interval
                      then 1 else rl.count + 1 end,
         bucket_time = case when rl.bucket_time < now() - (least(p_window_minutes, 1440) || ' minutes')::interval
                            then now() else rl.bucket_time end
  returning rl.count into v_count;
  return v_count;
end $$;
-- PostgreSQL grants EXECUTE to PUBLIC by default — revoke first, then grant ONLY service_role.
revoke execute on function public.lead_rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.lead_rate_limit_hit(text, int, int) to service_role;
