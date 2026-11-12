-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · M6 SEO-001 — the published index the sitemap is built from
-- ═══════════════════════════════════════════════════════════════════════════
-- `published_page(slug)` answers "what is at this address"; a build-time sitemap
-- instead needs "which addresses exist". Without it the generator had no way to
-- know about CMS pages at all, so a published page could never be listed — and a
-- draft, had it been listed, would have advertised a URL a stranger cannot open.
--
-- `published_page_index()` is the minimal public answer: the *published* slug
-- (so a renamed draft never rewrites a live URL), its kind (so the generator can
-- skip header/footer chrome documents, which are not addresses) and the moment
-- it went live (a real `lastmod`). Only rows with a published snapshot and
-- `status = 'published'` appear; drafts, unpublished pages and every current
-- draft column stay invisible.
--
-- Rollback: drop function if exists public.published_page_index();
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.published_page_index()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slug', p.published_snapshot->>'slug',
        'kind', p.kind,
        'published_at', p.published_snapshot->>'published_at'
      ) order by p.id
    ),
    '[]'::jsonb
  )
    from public.pages p
   where p.published_snapshot is not null
     and lower(p.status) = 'published'
     and coalesce(p.published_snapshot->>'slug', '') <> ''
$$;
revoke all on function public.published_page_index() from public;
grant execute on function public.published_page_index() to anon, authenticated;
