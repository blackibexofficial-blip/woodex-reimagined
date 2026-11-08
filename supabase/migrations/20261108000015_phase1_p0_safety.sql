-- Phase 1 P0 safety: draft isolation, project privacy, order RPC boundary,
-- and loss-safe page revisions. Additive migration; no existing rows rewritten.
-- Apply only after backup and staging verification. See docs/08-master-plan/PHASE1-P0-SAFETY.md.

-- The Edge Function uses service_role after validating requests. Do not expose
-- the security-definer order/stock operation through PostgREST to browser roles.
revoke execute on function public.order_submit(jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.order_submit(jsonb, jsonb, text, text) to service_role;

-- A published row contains the *current draft* as well as a published snapshot.
-- Public clients must not read the raw row, blocks, or the internal snapshot RPC.
drop policy if exists pages_public_read on public.pages;
drop policy if exists page_blocks_read on public.page_blocks;
revoke execute on function public.page_snapshot(bigint) from public, anon, authenticated;

-- A minimal published-only interface; never includes current draft columns.
create or replace function public.published_page(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select p.published_snapshot || jsonb_build_object('kind', p.kind)
    from public.pages p
   where p.published_snapshot->>'slug' = p_slug and p.published_snapshot is not null
     and lower(p.status) = 'published'
   order by p.id limit 1
$$;
revoke execute on function public.published_page(text) from public;
grant execute on function public.published_page(text) to anon, authenticated;

-- Serialize changes per page so version numbers and the saved block set remain
-- consistent. Saving retains the existing behavior: journal the prior draft.
create or replace function public.page_save(
  p_id bigint, p_title text, p_seo_title text default null,
  p_seo_desc text default null, p_theme jsonb default null,
  p_blocks jsonb default '[]'::jsonb, p_seo jsonb default '{}'::jsonb
) returns public.pages language plpgsql security definer set search_path = public as $$
declare pg public.pages; snap jsonb;
begin
  perform public.require_cap('page.manage');
  perform 1 from public.pages where id = p_id for update;
  if not found then raise exception 'page % not found', p_id; end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'page_save: blocks must be an array';
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

-- Every new publish/unpublish revision contains a complete top-level document.
create or replace function public.page_publish(p_id bigint, p_publish boolean default true)
returns public.pages language plpgsql security definer set search_path = public as $$
declare pg public.pages; snap jsonb;
begin
  perform public.require_cap('page.manage');
  perform 1 from public.pages where id = p_id for update;
  if not found then raise exception 'page % not found', p_id; end if;
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

-- Old publish revisions contain their document under published_snapshot. Other
-- old revisions sometimes contain no blocks at all: fail without mutating the
-- page rather than substituting an unrelated snapshot or an empty array.
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
  insert into public.page_blocks(page_id, type, props, sort)
  select p_id, b->>'type', coalesce(b->'props', '{}'::jsonb), ord - 1
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

-- Project practice, financial, production and private file metadata share the
-- payload with portfolio content. Staff may read the raw record; visitors get
-- an explicit allowlist only, never the full payload or unpublished projects.
drop policy if exists projects_read on public.projects;
create policy projects_staff_read on public.projects for select to authenticated
  using (public.has_cap('page.manage') or public.has_cap('crm.manage') or public.has_cap('finance.manage'));

create or replace function public.published_projects()
returns table(id text, payload jsonb, status text, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id,
    coalesce((select jsonb_object_agg(k, v) from jsonb_each(p.payload) as f(k, v)
      where (k in ('title','client','category','image','beforeImage','location','sqft',
        'year','employees','duration','description','challenge','solution') and jsonb_typeof(v) = 'string')
        or (k in ('rating','sortOrder') and jsonb_typeof(v) = 'number')), '{}'::jsonb)
    || jsonb_build_object(
      'active', true,
      'furnitureUsed', case when jsonb_typeof(p.payload->'furnitureUsed') = 'array' then
        (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(p.payload->'furnitureUsed') x where jsonb_typeof(x) = 'string')
        else '[]'::jsonb end
    )
    || case when jsonb_typeof(p.payload->'testimonial') = 'object' then
      jsonb_build_object('testimonial', coalesce((select jsonb_object_agg(k, v)
        from jsonb_each(p.payload->'testimonial') as t(k, v)
        where k in ('text','author','role') and jsonb_typeof(v) = 'string'), '{}'::jsonb))
      else '{}'::jsonb end,
    p.status, p.created_at, p.updated_at
  from public.projects p
  where lower(p.status) = 'published' and coalesce(p.payload->>'active', 'true') <> 'false'
$$;
revoke execute on function public.published_projects() from public;
grant execute on function public.published_projects() to anon, authenticated;
