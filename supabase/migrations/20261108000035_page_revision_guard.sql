-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · M6 CMS-002 — page revision checks + publish behind the token
-- ═══════════════════════════════════════════════════════════════════════════
-- The page builder already journals every save and republishes an immutable
-- `published_snapshot`, but two editors saving the same draft still overwrote each
-- other: `page_save` wrote whatever it was handed. The project side got a token in
-- 00022/00034; this migration gives the CMS the same contract.
--
--   * `pages.revision` — stamped by a trigger on every write (a client cannot set
--     it, freeze it or rewind it);
--   * `page_save(..., p_expected_revision)` — refuses a save made against a
--     revision someone else has since moved past (`40001`), before it journals a
--     version or touches the block set;
--   * `page_publish(..., p_expected_revision)` — same token, so a stale tab cannot
--     publish a draft it never read.
--
-- Deliberately unchanged: the published snapshot is still only replaced by
-- `page_publish`, a save never leaks into it, and `page_revert` still restores the
-- journal entry the user picked (the editor confirms that choice explicitly).
--
-- Rollback (in this order):
--   drop function if exists public.page_publish(bigint, boolean, integer);
--   drop function if exists public.page_save(bigint, text, text, text, jsonb, jsonb, jsonb, integer);
--   drop trigger if exists page_revision_stamp on public.pages;
--   drop function if exists public.stamp_page_revision();
--   alter table public.pages drop column if exists revision;
--   -- then re-run 00015/00002 to restore the previous signatures.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pages add column if not exists revision integer not null default 0;

-- ── the token is server-stamped ──────────────────────────────────────────────
create or replace function public.stamp_page_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 0;
    return new;
  end if;
  if new.revision is distinct from old.revision then
    raise exception 'The page revision is stamped by the server, not set by the client'
      using errcode = '40001';
  end if;
  new.revision := coalesce(old.revision, 0) + 1;
  return new;
end
$$;
revoke all on function public.stamp_page_revision() from public, anon, authenticated;

drop trigger if exists page_revision_stamp on public.pages;
create trigger page_revision_stamp before insert or update on public.pages
for each row execute function public.stamp_page_revision();

-- ── save: refuses a stale draft ──────────────────────────────────────────────
drop function if exists public.page_save(bigint, text, text, text, jsonb, jsonb, jsonb);

create or replace function public.page_save(
  p_id bigint,
  p_title text,
  p_seo_title text default null,
  p_seo_desc text default null,
  p_theme jsonb default null,
  p_blocks jsonb default '[]'::jsonb,
  p_seo jsonb default '{}'::jsonb,
  p_expected_revision integer default null
) returns public.pages language plpgsql security definer set search_path = public as $$
declare
  pg public.pages;
  snap jsonb;
  v_revision integer;
begin
  perform public.require_cap('page.manage');
  select p.revision into v_revision from public.pages p where p.id = p_id for update;
  if not found then raise exception 'page % not found', p_id using errcode = 'P0002'; end if;
  if p_expected_revision is not null and v_revision <> p_expected_revision then
    raise exception 'This page changed elsewhere (revision %, your copy %). Reload the editor before saving.',
      v_revision, p_expected_revision using errcode = '40001';
  end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'page_save: blocks must be an array' using errcode = '22023';
  end if;
  snap := public.page_snapshot(p_id);
  insert into public.page_versions(page_id, version, snapshot, who, action)
  values (p_id, coalesce((select max(v.version) from public.page_versions v where v.page_id = p_id), 0) + 1,
          snap, coalesce(auth.uid()::text, 'rpc'), 'save');
  delete from public.page_blocks where page_id = p_id;
  insert into public.page_blocks(page_id, type, props, sort)
  select p_id, b->>'type', coalesce(b->'props', '{}'::jsonb), ord - 1
    from jsonb_array_elements(p_blocks) with ordinality as t(b, ord);
  update public.pages
     set title = p_title, seo_title = p_seo_title, seo_desc = p_seo_desc,
         theme = p_theme, seo = p_seo, updated_at = now()
   where id = p_id returning * into pg;
  return pg;
end $$;
revoke all on function public.page_save(bigint, text, text, text, jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function public.page_save(bigint, text, text, text, jsonb, jsonb, jsonb, integer) to authenticated;

-- ── publish: same token ──────────────────────────────────────────────────────
drop function if exists public.page_publish(bigint, boolean);

create or replace function public.page_publish(
  p_id bigint,
  p_publish boolean default true,
  p_expected_revision integer default null
) returns public.pages language plpgsql security definer set search_path = public as $$
declare
  pg public.pages;
  snap jsonb;
  v_revision integer;
begin
  perform public.require_cap('page.manage');
  select p.revision into v_revision from public.pages p where p.id = p_id for update;
  if not found then raise exception 'page % not found', p_id using errcode = 'P0002'; end if;
  if p_expected_revision is not null and v_revision <> p_expected_revision then
    raise exception 'This page changed elsewhere (revision %, your copy %). Reload the editor before publishing.',
      v_revision, p_expected_revision using errcode = '40001';
  end if;
  snap := public.page_snapshot(p_id);
  if p_publish then snap := snap || jsonb_build_object('published_at', now()); end if;
  update public.pages
     set published_snapshot = case when p_publish then snap else null end,
         published_at = case when p_publish then now() else null end,
         status = case when p_publish then 'Published' else 'Draft' end,
         updated_at = now()
   where id = p_id returning * into pg;
  insert into public.page_versions(page_id, version, snapshot, who, action)
  values (p_id, coalesce((select max(v.version) from public.page_versions v where v.page_id = p_id), 0) + 1,
          snap, coalesce(auth.uid()::text, 'rpc'), case when p_publish then 'publish' else 'unpublish' end);
  return pg;
end $$;
revoke all on function public.page_publish(bigint, boolean, integer) from public, anon;
grant execute on function public.page_publish(bigint, boolean, integer) to authenticated;
