-- =============================================================================
-- Case Passport Variants — QR staff view (ภาคเสริม 4 §3)
--   shared_passports : snapshot เนื้อหา "เท่าที่อยู่บนใบกระดาษ" (no amplification)
--   passport_tokens  : token แบบ hash-only + expiry + revoke
-- Public read ไม่มี RLS policy ฝั่ง anon — การ resolve token ทำผ่าน service role
-- ใน API/page เท่านั้น (เทียบ hash ฝั่ง server)
-- =============================================================================

create table if not exists public.shared_passports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  audience   text not null default 'general',
  passport   jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.passport_tokens (
  id          uuid primary key default gen_random_uuid(),
  passport_id uuid not null references public.shared_passports(id) on delete cascade,
  token_hash  text not null unique,          -- sha256 hex — ไม่เก็บ token ดิบ
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_sp_user     on public.shared_passports(user_id, created_at desc);
create index if not exists idx_pt_passport on public.passport_tokens(passport_id);

alter table public.shared_passports enable row level security;
alter table public.passport_tokens  enable row level security;

drop policy if exists "own shared passports" on public.shared_passports;
create policy "own shared passports" on public.shared_passports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own passport tokens" on public.passport_tokens;
create policy "own passport tokens" on public.passport_tokens
  for all using (exists (select 1 from public.shared_passports p
                         where p.id = passport_id and p.user_id = auth.uid()))
  with check   (exists (select 1 from public.shared_passports p
                         where p.id = passport_id and p.user_id = auth.uid()));
