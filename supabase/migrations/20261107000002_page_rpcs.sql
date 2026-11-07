-- 20261107000002_page_rpcs — atomic builder writes for pages.
-- The storefront page builder must round-trip drafts + published snapshots
-- WITHOUT partial block loss; PostgREST upserts alone cannot do that in one
-- unit of work. Both functions build the snapshot (with blocks) inside the
-- same transaction as the write. Capability-checked (page.manage).
-- NOT rehearsed on hosted infra; rehearsed under pglite (see docs/08-master-plan, 8.1).

create or replace function public.page_snapshot(p_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'title', p.title,
    'seo_title', p.seo_title, 'seo_desc', p.seo_desc, 'theme', p.theme, 'seo', p.seo,
    'published_at', p.published_at,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('type', b.type, 'props', b.props) order by b.sort)
      from public.page_blocks b where b.page_id = p.id
    ), '[]'::jsonb)
  ) from public.pages p where p.id = p_id
$$;

create or replace function public.page_save(
  p_id bigint,
  p_title text,
  p_seo_title text default null,
  p_seo_desc text default null,
  p_theme jsonb default null,
  p_blocks jsonb default '[]'::jsonb,
  p_seo jsonb default '{}'::jsonb
) returns public.pages language plpgsql security definer set search_path = public as $$
declare pg public.pages; snap jsonb;
begin
  perform public.require_cap('page.manage');
  snap := public.page_snapshot(p_id);
  if snap is null then raise exception 'page % not found', p_id; end if;
  insert into public.page_versions(page_id, version, snapshot, who, action)
  values (p_id, coalesce((select max(v.version) from public.page_versions v where v.page_id = p_id), 0) + 1,
          snap, coalesce(auth.uid()::text, 'rpc'), 'save');
  delete from public.page_blocks where page_id = p_id;
  insert into public.page_blocks(page_id, type, props, sort)
  select p_id, b->>'type', coalesce(b->'props', '{}'::jsonb), ord - 1
  from jsonb_array_elements(p_blocks) with ordinality as t(b, ord);
  update public.pages
     set title = p_title, seo_title = p_seo_title, seo_desc = p_seo_desc, theme = p_theme, seo = p_seo, updated_at = now()
   where id = p_id returning * into pg;
  return pg;
end $$;

create or replace function public.page_publish(p_id bigint, p_publish boolean default true)
returns public.pages language plpgsql security definer set search_path = public as $$
declare pg public.pages; snap jsonb;
begin
  perform public.require_cap('page.manage');
  snap := public.page_snapshot(p_id);
  if snap is null then raise exception 'page % not found', p_id; end if;
  snap := snap || jsonb_build_object('published_at', now());
  update public.pages
     set published_snapshot = case when p_publish then snap else null end,
         published_at = case when p_publish then now() else null end,
         status = case when p_publish then 'Published' else 'Draft' end,
         updated_at = now()
   where id = p_id returning * into pg;
  insert into public.page_versions(page_id, version, snapshot, who, action)
  values (p_id, coalesce((select max(v.version) from public.page_versions v where v.page_id = p_id), 0) + 1,
          to_jsonb(pg), coalesce(auth.uid()::text, 'rpc'), case when p_publish then 'publish' else 'unpublish' end);
  return pg;
end $$;

create or replace function public.page_revert(p_id bigint, p_version int)
returns public.pages language plpgsql security definer set search_path = public as $$
declare pg public.pages; snap jsonb;
begin
  perform public.require_cap('page.manage');
  select snapshot into snap from public.page_versions
   where page_id = p_id and version = p_version;
  if snap is null then raise exception 'version % of page % not found', p_version, p_id; end if;
  delete from public.page_blocks where page_id = p_id;
  insert into public.page_blocks(page_id, type, props, sort)
  select p_id, b->>'type', coalesce(b->'props', '{}'::jsonb), ord - 1
  from jsonb_array_elements(coalesce(snap->'blocks', '[]'::jsonb)) with ordinality as t(b, ord);
  update public.pages
     set title = coalesce(snap->>'title', title),
         seo_title = snap->>'seo_title', seo_desc = snap->>'seo_desc',
         theme = snap->'theme', seo = coalesce(snap->'seo', seo),
         updated_at = now()
   where id = p_id returning * into pg;
  insert into public.page_versions(page_id, version, snapshot, who, action)
  values (p_id, coalesce((select max(v.version) from public.page_versions v where v.page_id = p_id), 0) + 1,
          to_jsonb(pg), coalesce(auth.uid()::text, 'rpc'), 'revert:' || p_version);
  return pg;
end $$;
