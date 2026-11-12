-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · M6 BLD-003 — the block persistence contract
-- ═══════════════════════════════════════════════════════════════════════════
-- What the editor draws and what the database keeps were two different things.
-- `page_blocks` stored type/props/sort and nothing else, so the only thing
-- identifying a block was its position: a Puck instance's `props.id` was copied
-- into jsonb by luck, never checked, and never guaranteed. A document could be
-- saved with two blocks claiming the same id, with no type at all (a raw 23502
-- from a NOT NULL column), with `props` as a string, or with a megabyte payload.
--
-- The contract this migration enforces — the same rules the storefront's
-- `preparePublicDocument` already applies before rendering:
--
--   1. every block has a non-empty `type` matching ^[A-Za-z][A-Za-z0-9]{0,63}$
--   2. every block has `props`; absent is normalised to {}, anything else is refused
--   3. block identity lives in `props.id` (Puck's own field) and is
--      a) preserved byte-for-byte across save → journal → publish → revert,
--      b) generated deterministically when a client omits it, so a legacy
--         document gets a stable id instead of a new one on every read,
--      c) unique within the page,
--      d) mirrored in `page_blocks.block_id` so the database can enforce (c)
--   4. order is `sort`, contiguous from 0 after every save
--   5. a save is bounded: ≤ 200 blocks and ≤ 512 KB of block JSON
--
-- Every refusal is `22023` with a message naming the block, so the editor can
-- say what is wrong instead of surfacing a constraint name.
--
-- Rollback:
--   drop function if exists public.page_save(bigint,text,text,text,jsonb,jsonb,jsonb,integer);
--   drop index if exists public.page_blocks_page_block_id_key;
--   alter table public.page_blocks drop column if exists block_id;
--   (then re-create page_save/page_snapshot/page_revert from 00035/00015)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.page_blocks add column if not exists block_id text;
-- Existing rows get an identity derived from their own row id: stable forever,
-- and different from the 'b<position>' fallback the RPCs use.
update public.page_blocks set block_id = 'b' || id where block_id is null or btrim(block_id) = '';
-- A default keeps direct INSERTs (fixtures, maintenance scripts) working without
-- having to invent an identity; the RPCs always supply the authored one.
alter table public.page_blocks alter column block_id set default ('b' || replace(gen_random_uuid()::text, '-', ''));
alter table public.page_blocks alter column block_id set not null;
create unique index if not exists page_blocks_page_block_id_key on public.page_blocks(page_id, block_id);

-- Identity travels inside props (Puck's shape), so a published document keeps the
-- ids it was authored with. Nothing new is exposed: `published_page` already
-- returned props verbatim.
create or replace function public.page_snapshot(p_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'title', p.title,
    'seo_title', p.seo_title, 'seo_desc', p.seo_desc, 'theme', p.theme, 'seo', p.seo,
    'published_at', p.published_at,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('type', b.type, 'props', b.props) order by b.sort, b.id)
      from public.page_blocks b where b.page_id = p.id
    ), '[]'::jsonb)
  ) from public.pages p where p.id = p_id
$$;
revoke execute on function public.page_snapshot(bigint) from public, anon, authenticated;

drop function if exists public.page_save(bigint, text, text, text, jsonb, jsonb, jsonb, integer);

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
  v_block jsonb;
  v_ord bigint;
  v_type text;
  v_id text;
  v_seen text[] := '{}';
  v_count integer := 0;
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
  v_count := jsonb_array_length(p_blocks);
  if v_count > 200 then
    raise exception 'page_save: % blocks exceeds the 200-block limit for one page', v_count using errcode = '22023';
  end if;
  if octet_length(p_blocks::text) > 524288 then
    raise exception 'page_save: block payload is larger than 512 KB' using errcode = '22023';
  end if;

  -- Validate every block before touching the page: a refused save must leave the
  -- draft, the journal and the revision exactly as they were.
  for v_block, v_ord in
    select b, ord from jsonb_array_elements(p_blocks) with ordinality as t(b, ord)
  loop
    if jsonb_typeof(v_block) <> 'object' then
      raise exception 'page_save: block % is not an object', v_ord using errcode = '22023';
    end if;
    v_type := btrim(coalesce(v_block->>'type', ''));
    if v_type = '' then
      raise exception 'page_save: block % has no type', v_ord using errcode = '22023';
    end if;
    if v_type !~ '^[A-Za-z][A-Za-z0-9]{0,63}$' then
      raise exception 'page_save: block % has an invalid type "%"', v_ord, v_type using errcode = '22023';
    end if;
    if v_block ? 'props' and jsonb_typeof(v_block->'props') <> 'object' then
      raise exception 'page_save: block % props must be an object', v_ord using errcode = '22023';
    end if;
    v_id := btrim(coalesce(v_block->'props'->>'id', ''));
    if v_id <> '' then
      if v_id !~ '^[a-zA-Z0-9_-]{1,120}$' then
        raise exception 'page_save: block % has an invalid id "%"', v_ord, v_id using errcode = '22023';
      end if;
      if v_id = any(v_seen) then
        raise exception 'page_save: block % repeats the id "%" used by an earlier block', v_ord, v_id using errcode = '22023';
      end if;
      v_seen := v_seen || v_id;
    end if;
  end loop;

  snap := public.page_snapshot(p_id);
  insert into public.page_versions(page_id, version, snapshot, who, action)
  values (p_id, coalesce((select max(v.version) from public.page_versions v where v.page_id = p_id), 0) + 1,
          snap, coalesce(auth.uid()::text, 'rpc'), 'save');

  delete from public.page_blocks where page_id = p_id;
  insert into public.page_blocks(page_id, type, props, sort, block_id)
  select p_id,
         btrim(b->>'type'),
         -- a block without an id gets a deterministic one, and gets it written into
         -- props so every later read sees the same identity
         case when btrim(coalesce(b->'props'->>'id', '')) = ''
              then coalesce(b->'props', '{}'::jsonb) || jsonb_build_object('id', 'b' || (ord - 1))
              else b->'props' end,
         ord - 1,
         coalesce(nullif(btrim(coalesce(b->'props'->>'id', '')), ''), 'b' || (ord - 1))
    from jsonb_array_elements(p_blocks) with ordinality as t(b, ord);

  update public.pages
     set title = p_title, seo_title = p_seo_title, seo_desc = p_seo_desc,
         theme = p_theme, seo = p_seo, updated_at = now()
   where id = p_id returning * into pg;
  return pg;
end $$;
revoke execute on function public.page_save(bigint, text, text, text, jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function public.page_save(bigint, text, text, text, jsonb, jsonb, jsonb, integer) to authenticated;

-- Restoring a journal entry must restore identities too, not just content.
create or replace function public.page_revert(p_id bigint, p_version int)
returns public.pages language plpgsql security definer set search_path = public as $$
declare pg public.pages; snap jsonb; version_action text;
begin
  perform public.require_cap('page.manage');
  perform 1 from public.pages where id = p_id for update;
  if not found then raise exception 'page % not found', p_id; end if;
  select snapshot, action into snap, version_action from public.page_versions
   where page_id = p_id and version = p_version;
  if snap is null then raise exception 'version % of page % not found', p_version, p_id; end if;
  if jsonb_typeof(snap->'blocks') is distinct from 'array' then
    if version_action = 'publish' and jsonb_typeof(snap->'published_snapshot'->'blocks') = 'array' then
      snap := snap->'published_snapshot';
    else
      raise exception 'version % of page % has no recoverable blocks; restore aborted', p_version, p_id;
    end if;
  end if;
  delete from public.page_blocks where page_id = p_id;
  insert into public.page_blocks(page_id, type, props, sort, block_id)
  select p_id, b->>'type',
         case when btrim(coalesce(b->'props'->>'id', '')) = ''
              then coalesce(b->'props', '{}'::jsonb) || jsonb_build_object('id', 'b' || (ord - 1))
              else b->'props' end,
         ord - 1,
         coalesce(nullif(btrim(coalesce(b->'props'->>'id', '')), ''), 'b' || (ord - 1))
    from jsonb_array_elements(snap->'blocks') with ordinality as t(b, ord);
  update public.pages
     set title = coalesce(snap->>'title', title), seo_title = snap->>'seo_title',
         seo_desc = snap->>'seo_desc', theme = snap->'theme',
         seo = coalesce(snap->'seo', seo), updated_at = now()
   where id = p_id returning * into pg;
  insert into public.page_versions(page_id, version, snapshot, who, action)
  values (p_id, coalesce((select max(v.version) from public.page_versions v where v.page_id = p_id), 0) + 1,
          public.page_snapshot(p_id), coalesce(auth.uid()::text, 'rpc'), 'revert:' || p_version);
  return pg;
end $$;
revoke execute on function public.page_revert(bigint, integer) from public, anon;
grant execute on function public.page_revert(bigint, integer) to authenticated;
