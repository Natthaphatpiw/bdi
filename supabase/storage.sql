-- =============================================================================
-- รู้สิทธิ์ รู้สุข — Storage bucket for user-uploaded documents (PDF policies)
-- Run AFTER schema.sql, in Supabase → SQL Editor.
-- The app uploads via the service_role (bypasses RLS), but these policies also
-- let an authenticated user read/manage ONLY files under their own /<uid>/ folder.
-- =============================================================================

-- private bucket (objects are not publicly accessible)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- RLS on storage.objects: a user can only touch files in their own uid-prefixed folder
drop policy if exists "documents own read"   on storage.objects;
drop policy if exists "documents own write"  on storage.objects;
drop policy if exists "documents own update" on storage.objects;
drop policy if exists "documents own delete" on storage.objects;

create policy "documents own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents own write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
