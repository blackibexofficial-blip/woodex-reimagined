-- 20261108000014_storage_projects_bucket — real file storage for the practice workspace.
-- Creates a PRIVATE bucket `projects` for job-scoped files:
--   object name convention: <project-id>/<sanitized-file-name>
--   e.g. projects/7/GU7-floor-plan-rev3.dwg
-- Posture (owner decision 2026-11-08, "crm_manage"):
--   bucket: private, 50 MB per object cap, no MIME allowlist
--   read   authenticated: has_cap('crm.manage')
--   write  authenticated (insert/update/delete): has_cap('crm.manage')
--   finance.manage / viewer / anon: NO access in this slice (deliberate — storage
--     posture is narrower than the actuals ledger's finance read).
-- Objects are immutable-ish working files; the app writes metadata rows in the
-- payload (Practice files list) pointing at these objects.
--
-- Rollback: drop the four policies; delete the bucket (emptied first):
--   delete from storage.objects where bucket_id = 'projects'; delete from storage.buckets where id = 'projects';
-- Rehearsed under pglite with a storage-schema stub (buckets/objects) — the stub
-- stands in for Supabase Storage's built-in schema; hosted keeps its own.
-- The hosted project has NOT executed this file (no Supabase egress in the authoring
-- environment).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projects', 'projects', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = 52428800;

alter table storage.objects enable row level security;

-- Auth-schema-style grants so the policies (not table ACLs) are the only gate —
-- mirrors hosted Supabase, which ships storage.objects with broad grants + RLS.
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists projects_bucket_read on storage.objects;
drop policy if exists projects_bucket_insert on storage.objects;
drop policy if exists projects_bucket_update on storage.objects;
drop policy if exists projects_bucket_delete on storage.objects;

create policy projects_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'projects' and public.has_cap('crm.manage'));
create policy projects_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'projects' and public.has_cap('crm.manage'));
create policy projects_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'projects' and public.has_cap('crm.manage'))
  with check (bucket_id = 'projects' and public.has_cap('crm.manage'));
create policy projects_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'projects' and public.has_cap('crm.manage'));
