-- Hosted AI attempt limits. No existing rows are changed. Only the Edge
-- Function's trusted service role may reserve capacity. Limits are required
-- arguments supplied from server configuration, never from request JSON.
-- Counts represent provider attempts, not money or token usage.
create table public.ai_usage_windows (
  bucket text primary key,
  started_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.ai_usage_windows enable row level security;
revoke all on table public.ai_usage_windows from public, anon, authenticated, service_role;

create function public.ai_usage_reserve(p_user_id uuid, p_user_limit integer, p_global_limit integer)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_user_bucket text;
  v_global public.ai_usage_windows%rowtype;
  v_user public.ai_usage_windows%rowtype;
  v_now timestamptz;
  v_global_attempts integer;
  v_user_attempts integer;
begin
  if p_user_id is null or p_user_limit is null or p_user_limit < 1 or p_user_limit > 1000
     or p_global_limit is null or p_global_limit < 1 or p_global_limit > 100000 then
    raise exception 'invalid AI usage limit configuration' using errcode = '22023';
  end if;
  v_user_bucket := 'user:' || p_user_id::text;
  -- All calls lock global first, then the user bucket, to serialize the two
  -- decisions and avoid inconsistent ordering. No quota is consumed on denial.
  insert into public.ai_usage_windows(bucket,started_at,attempts)
    values ('global',clock_timestamp(),0) on conflict (bucket) do nothing;
  select * into v_global from public.ai_usage_windows where bucket='global' for update;
  insert into public.ai_usage_windows(bucket,started_at,attempts)
    values (v_user_bucket,clock_timestamp(),0) on conflict (bucket) do nothing;
  select * into v_user from public.ai_usage_windows where bucket=v_user_bucket for update;
  v_now := clock_timestamp();
  v_global_attempts := case when v_now >= v_global.started_at + interval '24 hours' then 0 else v_global.attempts end;
  v_user_attempts := case when v_now >= v_user.started_at + interval '10 minutes' then 0 else v_user.attempts end;
  if v_global_attempts >= p_global_limit or v_user_attempts >= p_user_limit then
    return false;
  end if;
  update public.ai_usage_windows set
    started_at = case when v_global_attempts = 0 then v_now else v_global.started_at end,
    attempts = v_global_attempts + 1 where bucket='global';
  update public.ai_usage_windows set
    started_at = case when v_user_attempts = 0 then v_now else v_user.started_at end,
    attempts = v_user_attempts + 1 where bucket=v_user_bucket;
  return true;
end $$;
revoke execute on function public.ai_usage_reserve(uuid, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.ai_usage_reserve(uuid, integer, integer) to service_role;
