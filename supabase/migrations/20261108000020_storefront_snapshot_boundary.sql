-- Prepared boundary for a future public builder route. No route is enabled by
-- this migration. Existing preview RPCs and URLs are deliberately unchanged.
-- Apply only after backup and staging review; see PHASE1-CMS-SNAPSHOTS.md.
create or replace function public.storefront_page_snapshot(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  with candidates as (
    select p.published_snapshot as snap
      from public.pages p
     where p.kind = 'page'
       and lower(p.status) = 'published'
       and p.published_snapshot->>'slug' = p_slug
  ), single_candidate as (
    select snap from candidates where (select count(*) from candidates) = 1
  )
  select jsonb_build_object(
    'id', snap->'id',
    'slug', snap->'slug',
    'title', snap->'title',
    'seo_title', case when jsonb_typeof(snap->'seo_title') = 'string' then snap->'seo_title' else 'null'::jsonb end,
    'seo_desc', case when jsonb_typeof(snap->'seo_desc') = 'string' then snap->'seo_desc' else 'null'::jsonb end,
    'seo', jsonb_build_object(
      'title', case when jsonb_typeof(snap->'seo'->'title') = 'string' then snap->'seo'->'title' else 'null'::jsonb end,
      'description', case when jsonb_typeof(snap->'seo'->'description') = 'string' then snap->'seo'->'description' else 'null'::jsonb end,
      'noindex', case when jsonb_typeof(snap->'seo'->'noindex') = 'boolean' then snap->'seo'->'noindex' when snap->'seo'->'noindex' is null then 'false'::jsonb else 'true'::jsonb end
    ),
    'theme', case when jsonb_typeof(snap->'theme') = 'object' then snap->'theme' else '{}'::jsonb end,
    'published_at', snap->'published_at',
    'blocks', (
      select coalesce(jsonb_agg(jsonb_build_object('type', b->'type', 'props', b->'props') order by ord), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(snap->'blocks') = 'array' then snap->'blocks' else '[]'::jsonb end) with ordinality as items(b, ord)
    )
  )
  from single_candidate
  where jsonb_typeof(snap) = 'object'
    and jsonb_typeof(snap->'slug') = 'string'
    and jsonb_typeof(snap->'title') = 'string'
    and jsonb_typeof(snap->'blocks') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(snap->'blocks') = 'array' then snap->'blocks' else '[]'::jsonb end) b
       where jsonb_typeof(b) is distinct from 'object'
          or jsonb_typeof(b->'type') is distinct from 'string'
          or jsonb_typeof(b->'props') is distinct from 'object'
    )
$$;
revoke execute on function public.storefront_page_snapshot(text) from public;
grant execute on function public.storefront_page_snapshot(text) to anon, authenticated;
