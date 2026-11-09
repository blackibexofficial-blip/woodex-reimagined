-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Anon grant hardening (candidate)
-- Isolated local candidate — written after the first hosted run showed a gap.
--
-- Why: on a hosted Supabase project the platform's default privileges hand the
-- `anon` role INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on every table
-- in `public`. Migrations 00001–00021 only ever wrote `grant select` — they
-- never revoked the defaults — so the grant layer is wider than the policy
-- layer. Measured on the staging database before this file:
--     54 tables where anon holds write grants and has no anon write policy
--     (only `track_events` legitimately keeps an anon INSERT policy).
-- Row-level security still denies the writes, so this is defence in depth, not
-- an open door — but least privilege belongs in the schema, not in one policy.
--
-- Adds:
--   * revoke insert/update/delete from anon on every public table that has no
--     anon (or `public`) write policy;
--   * revoke truncate/references/trigger from anon on every public table.
--
-- Rules:
--   * idempotent — safe to re-run, and a no-op on databases (PGlite) where the
--     defaults never existed;
--   * policy-aware — a table that grows an anon write policy keeps its grant;
--   * SELECT is deliberately NOT touched: RLS already returns zero rows and
--     revoking it would turn a quiet empty result into a 42501 for storefront
--     embeds. Tightening reads needs a storefront read audit first.
--   * `authenticated` is deliberately NOT touched: staff policies rely on it.
--
-- Deliberate limits:
--   * Does not revoke anon EXECUTE on functions (that is per-function, done in
--     the migration that creates each RPC).
--   * Does not touch the `storage` or `auth` schemas — those are owned by
--     Supabase roles, see 20261108000014_storage_projects_bucket.sql.
--
-- Rollback: the grants can be restored with
--   grant insert, update, delete on all tables in schema public to anon;
--   grant truncate, references, trigger on all tables in schema public to anon;
-- (which is exactly the Supabase default this file removes).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  rel regclass;
  n integer := 0;
begin
  for rel in
    select c.oid::regclass
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind in ('r', 'p')
       and (has_table_privilege('anon', c.oid, 'INSERT')
            or has_table_privilege('anon', c.oid, 'UPDATE')
            or has_table_privilege('anon', c.oid, 'DELETE'))
       and not exists (
         select 1
           from pg_policies p
          where p.schemaname = 'public'
            and p.tablename = c.relname
            and p.cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
            and (p.roles::text[]) && array['anon', 'public'])
  loop
    execute format('revoke insert, update, delete on table %s from anon', rel);
    n := n + 1;
  end loop;
  raise notice 'anon write grants revoked on % table(s)', n;
end
$$;

-- TRUNCATE bypasses row-level security entirely, so it must never be held by
-- an anonymous caller; REFERENCES and TRIGGER are schema-shaping, not data.
revoke truncate, references, trigger on all tables in schema public from anon;

-- Sequences: anon never inserts directly, so it never needs nextval either.
revoke all on all sequences in schema public from anon;
