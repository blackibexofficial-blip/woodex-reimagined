-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · M6 CMS-001 — a real authenticated draft preview
-- ═══════════════════════════════════════════════════════════════════════════
-- The publish pipeline was already sound: `page_save` writes the draft and
-- journals it, `page_publish` copies the current draft into an immutable
-- `published_snapshot`, and `published_page(slug)` is the only public read.
--
-- What was missing was the "authed preview" step. The `/lab/:slug` route guessed:
-- it asked the admin API for the page and fell back to the public snapshot — so
-- in demo mode a draft could be read by anybody who knew the slug, and on
-- Supabase it depended on RLS rather than a stated rule.
--
-- `page_preview(slug)` makes the rule explicit and testable:
--   * `page.manage` only (anyone else gets `42501`, never the draft);
--   * resolves the page by its *current* draft slug or by the published slug, so
--     a renamed draft still previews from the address people bookmark;
--   * returns the draft document plus `status` and `revision`, never the
--     published snapshot's contents (that is `published_page`'s job).
--
-- Rollback: drop function if exists public.page_preview(text);
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.page_preview(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_snap jsonb;
begin
  if not public.has_cap('page.manage') then
    raise exception 'Missing capability: page.manage' using errcode = '42501';
  end if;
  select p.id into v_id
    from public.pages p
   where p.slug = p_slug
      or p.published_snapshot->>'slug' = p_slug
   order by p.id
   limit 1;
  if v_id is null then
    return null;
  end if;
  v_snap := public.page_snapshot(v_id);
  return v_snap || jsonb_build_object(
    'kind', (select p.kind from public.pages p where p.id = v_id),
    'status', (select lower(p.status) from public.pages p where p.id = v_id),
    'revision', (select p.revision from public.pages p where p.id = v_id)
  );
end
$$;
revoke all on function public.page_preview(text) from public, anon;
grant execute on function public.page_preview(text) to authenticated;
