-- =============================================================================
-- Guardian Mode + Monthly Health Check
--   guardian_consents      — behavioral-data consent records (grant/revoke)
--   health_check_sessions  — one row per "เช็คสุขภาพ 2 นาที" run (summary JSONB)
--   behavioral_samples     — raw time-series per station, chunked JSONB
--   guardian_events        — anomaly signals + user-chosen outcomes (telemetry)
--   profiles               — extended with emergency contact fields
-- Conventions follow supabase/schema.sql: user_id -> auth.users(id), RLS
-- `auth.uid() = user_id`, session-scoped tables via EXISTS on the owner row.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.guardian_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  consent_version text not null,
  scopes          jsonb not null default '["motion_sensor","touch_timing","typing_timing","device_info"]'::jsonb,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

create table if not exists public.health_check_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  consent_id   uuid not null references public.guardian_consents(id),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  is_baseline  boolean not null default false,
  device_info  jsonb not null default '{}'::jsonb,   -- {ua, platform, screen, dpr}
  summary      jsonb not null default '{}'::jsonb    -- {stations_completed:[], features:{station:{...}}, zscores:{...}}
);

create table if not exists public.behavioral_samples (
  id             bigint generated always as identity primary key,
  session_id     uuid not null references public.health_check_sessions(id) on delete cascade,
  station        text not null check (station in ('hold_still','tap_target','typing','gait')),
  seq            int  not null default 0,
  sample_rate_hz numeric,
  started_at     timestamptz,
  ended_at       timestamptz,
  samples        jsonb not null,                      -- [{t,ax,ay,az,ra,rb,rg}] | [{t,tx,ty,px,py,rt,miss}] | [{t,len,del}]
  features       jsonb not null default '{}'::jsonb,
  unique (session_id, station, seq)
);

create table if not exists public.guardian_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  source         text not null check (source in ('simulated','sensor')),
  pattern        text not null check (pattern in ('fall','tremor','drops')),
  chosen_symptom text,
  outcome        text,        -- dismissed|routed_triage|befast_negative|emergency_opened|tel_1669_tapped|ucep_shown|family_notified|er_passport_created|suppressed_cooldown
  payload        jsonb not null default '{}'::jsonb,  -- {onset, befast:{f,a,s}, geo_ok:bool, timeline:[{outcome,at}], ...}
  created_at     timestamptz not null default now()
);

-- Emergency Co-pilot remembers the callback number + chronic conditions/meds
-- the user typed, so the 1669 script is prefilled next time.
alter table public.profiles add column if not exists emergency_phone text;
alter table public.profiles add column if not exists conditions_meds text;

create index if not exists idx_hcs_user_started  on public.health_check_sessions(user_id, started_at desc);
create index if not exists idx_bs_session        on public.behavioral_samples(session_id);
create index if not exists idx_ge_user_created   on public.guardian_events(user_id, created_at desc);
create index if not exists idx_hcs_summary_gin   on public.health_check_sessions using gin (summary);

alter table public.guardian_consents      enable row level security;
alter table public.health_check_sessions  enable row level security;
alter table public.behavioral_samples     enable row level security;
alter table public.guardian_events        enable row level security;

drop policy if exists "own consents" on public.guardian_consents;
create policy "own consents"  on public.guardian_consents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sessions" on public.health_check_sessions;
create policy "own sessions"  on public.health_check_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own samples" on public.behavioral_samples;
create policy "own samples"   on public.behavioral_samples
  for all using (exists (select 1 from public.health_check_sessions s
                         where s.id = session_id and s.user_id = auth.uid()))
  with check   (exists (select 1 from public.health_check_sessions s
                         where s.id = session_id and s.user_id = auth.uid()));

drop policy if exists "own events" on public.guardian_events;
create policy "own events"    on public.guardian_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
