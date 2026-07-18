-- Verified Care Route MVP schema for Supabase PostgreSQL.
-- Runtime requires PostgreSQL only; PostGIS and Neo4j are intentionally not required.
-- Idempotency: objects use IF NOT EXISTS; policies, views and functions are recreated safely.
-- Rollback notes: drop views/functions first, then tables in reverse dependency order.
-- Do not run the rollback in production without exporting case/passport/feedback data.

begin;

create extension if not exists pgcrypto;

create table if not exists public.source_documents (
  id text primary key,
  title text not null,
  publisher text not null,
  url text,
  document_type text not null,
  published_at date,
  effective_date date,
  retrieved_at timestamptz not null default now(),
  content_hash text,
  verification_status text not null check (verification_status in ('VERIFIED','NEEDS_CONFIRMATION','EXPIRED','DEMO_ONLY')),
  is_official boolean not null default false,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create table if not exists public.agencies (
  id text primary key,
  name_th text not null,
  phone text,
  website_url text,
  source_id text references public.source_documents(id),
  effective_from date,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create table if not exists public.health_rights (
  id text primary key,
  code text not null unique,
  name_th text not null,
  description_th text not null,
  active boolean not null default true,
  source_id text not null references public.source_documents(id),
  effective_from date not null,
  effective_to date,
  verification_status text not null check (verification_status in ('VERIFIED','NEEDS_CONFIRMATION','EXPIRED','DEMO_ONLY')),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.conditions (
  id text primary key,
  icd10 text,
  name_th text not null,
  category text not null,
  safety_note_th text,
  active boolean not null default true,
  source_id text not null references public.source_documents(id),
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.symptoms (
  id text primary key,
  name_th text not null,
  aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(aliases) = 'array'),
  red_flag boolean not null default false,
  red_flag_level text,
  active boolean not null default true,
  source_id text not null references public.source_documents(id),
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.symptom_condition_links (
  symptom_id text not null references public.symptoms(id) on delete cascade,
  condition_id text not null references public.conditions(id) on delete cascade,
  likelihood numeric(5,4) check (likelihood is null or (likelihood >= 0 and likelihood <= 1)),
  source_id text not null references public.source_documents(id),
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  primary key (symptom_id, condition_id),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.services (
  id text primary key,
  name_th text not null,
  type text not null,
  care_level text not null check (care_level in ('PRIMARY','SECONDARY','TERTIARY','EMERGENCY')),
  description_th text,
  eligible_age_min integer check (eligible_age_min is null or eligible_age_min >= 0),
  eligible_age_max integer check (eligible_age_max is null or eligible_age_max >= 0),
  interval_months integer check (interval_months is null or interval_months > 0),
  active boolean not null default true,
  source_id text not null references public.source_documents(id),
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  check (eligible_age_max is null or eligible_age_min is null or eligible_age_max >= eligible_age_min),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.condition_service_links (
  condition_id text not null references public.conditions(id) on delete cascade,
  service_id text not null references public.services(id) on delete cascade,
  guideline_th text,
  priority integer not null default 100,
  source_id text not null references public.source_documents(id),
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  primary key (condition_id, service_id),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.service_right_coverages (
  service_id text not null references public.services(id) on delete cascade,
  right_id text not null references public.health_rights(id) on delete cascade,
  coverage_status text not null check (coverage_status in ('COVERED','COVERED_CONDITIONAL','NOT_COVERED','UNKNOWN')),
  copay_type text not null check (copay_type in ('FREE','FIXED','VARIABLE','UNKNOWN')),
  copay_amount numeric(12,2) check (copay_amount is null or copay_amount >= 0),
  copay_text_th text not null,
  conditions_th text,
  referral_required boolean,
  effective_from date not null,
  effective_to date,
  source_id text not null references public.source_documents(id),
  verification_status text not null check (verification_status in ('VERIFIED','NEEDS_CONFIRMATION','EXPIRED','DEMO_ONLY')),
  primary key (service_id, right_id, effective_from),
  check (effective_to is null or effective_to >= effective_from),
  check (copay_type <> 'FREE' or (verification_status = 'VERIFIED' and coalesce(copay_amount, 0) = 0))
);

create table if not exists public.areas (
  id text primary key,
  area_code text not null unique,
  name_th text not null,
  level text not null,
  parent_id text references public.areas(id),
  source_id text not null references public.source_documents(id),
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.facilities (
  id text primary key,
  hcode text,
  name_th text not null,
  facility_type text not null,
  care_level text not null check (care_level in ('PRIMARY','SECONDARY','TERTIARY','EMERGENCY')),
  address_th text,
  area_id text not null references public.areas(id),
  lat double precision check (lat is null or (lat >= -90 and lat <= 90)),
  lng double precision check (lng is null or (lng >= -180 and lng <= 180)),
  phone text,
  website_url text,
  map_url text,
  opening_hours jsonb not null default '{}'::jsonb,
  call_before_visit boolean not null default true,
  source_id text not null references public.source_documents(id),
  data_updated_at timestamptz,
  effective_from date not null,
  effective_to date,
  verification_status text not null check (verification_status in ('VERIFIED','NEEDS_CONFIRMATION','EXPIRED','DEMO_ONLY')),
  active boolean not null default true,
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.facility_rights (
  facility_id text not null references public.facilities(id) on delete cascade,
  right_id text not null references public.health_rights(id) on delete cascade,
  acceptance_status text not null check (acceptance_status in ('ACCEPTED','CONDITIONAL','UNKNOWN')),
  conditions_th text,
  source_id text not null references public.source_documents(id),
  verified_at timestamptz,
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  primary key (facility_id, right_id),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.facility_services (
  facility_id text not null references public.facilities(id) on delete cascade,
  service_id text not null references public.services(id) on delete cascade,
  availability_status text not null check (availability_status in ('AVAILABLE','AVAILABLE_CONDITIONAL','UNAVAILABLE','UNKNOWN')),
  conditions_th text,
  source_id text not null references public.source_documents(id),
  verified_at timestamptz,
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  primary key (facility_id, service_id),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.benefits (
  id text primary key,
  name_th text not null,
  description_th text not null,
  value_text_th text,
  case_relevance_tags jsonb not null default '[]'::jsonb check (jsonb_typeof(case_relevance_tags) = 'array'),
  agency_id text references public.agencies(id),
  active boolean not null default true,
  source_id text not null references public.source_documents(id),
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.eligibility_rules (
  id text primary key,
  benefit_id text not null references public.benefits(id) on delete cascade,
  description_th text not null,
  logic_json jsonb not null check (jsonb_typeof(logic_json) = 'object'),
  required_attrs jsonb not null check (jsonb_typeof(required_attrs) = 'array' and jsonb_array_length(required_attrs) > 0),
  effective_from date not null,
  effective_to date,
  source_id text not null references public.source_documents(id),
  verification_status text not null default 'NEEDS_CONFIRMATION',
  active boolean not null default true,
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.safety_rules (
  id text primary key,
  keywords jsonb not null check (jsonb_typeof(keywords) = 'array'),
  normalized_symptom_id text references public.symptoms(id),
  urgency_floor text not null check (urgency_floor in ('EMERGENCY_NOW','URGENT_TODAY','SOON_1_3_DAYS','ROUTINE_APPOINTMENT','SELF_CARE_WITH_MONITORING')),
  hotline text,
  message_th text not null,
  exclusions jsonb not null default '[]'::jsonb,
  negation_patterns jsonb not null default '[]'::jsonb,
  source_id text not null references public.source_documents(id),
  effective_from date not null,
  effective_to date,
  verification_status text not null default 'NEEDS_CONFIRMATION',
  active boolean not null default true,
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.fact_sources (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  predicate text not null,
  source_id text not null references public.source_documents(id),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reviewer text,
  extracted_at timestamptz not null default now(),
  effective_from date,
  effective_to date,
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  unique (entity_type, entity_id, predicate, source_id, effective_from)
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  demo_session_id text,
  status text not null default 'draft' check (status in ('draft','collecting_information','emergency_escalated','ready_for_review','processing','route_ready','passport_ready','closed')),
  original_narrative text,
  patient_relation text,
  age integer check (age is null or (age >= 0 and age <= 130)),
  sex text,
  scheme text check (scheme is null or scheme in ('UCS','SSS','CSMBS','PRIVATE','UNKNOWN')),
  area_code text,
  preferred_time text,
  current_lat double precision check (current_lat is null or (current_lat >= -90 and current_lat <= 90)),
  current_lng double precision check (current_lng is null or (current_lng >= -180 and current_lng <= 180)),
  consent_scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  check (user_id is not null or demo_session_id is not null)
);

create table if not exists public.case_slots (
  case_id uuid not null references public.cases(id) on delete cascade,
  slot_key text not null,
  slot_value jsonb not null,
  source text not null check (source in ('USER','PREFILL','LLM_EXTRACTED','RULE_DERIVED','USER_CONFIRMED')),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (case_id, slot_key)
);

create table if not exists public.case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text,
  structured_content jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.triage_assessments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  raw_model_output jsonb,
  normalized_result jsonb not null,
  deterministic_override jsonb,
  final_urgency text not null,
  provider_internal text,
  created_at timestamptz not null default now()
);

create table if not exists public.eligibility_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  rule_id text not null references public.eligibility_rules(id),
  benefit_id text not null references public.benefits(id),
  result text not null check (result in ('ELIGIBLE','NOT_ELIGIBLE','INDETERMINATE')),
  input_facts jsonb not null default '{}'::jsonb,
  trace jsonb not null default '[]'::jsonb,
  source_id text not null references public.source_documents(id),
  decided_at timestamptz not null default now()
);

create table if not exists public.care_routes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  route_type text not null check (route_type in ('PRIMARY','BACKUP','EMERGENCY')),
  facility_id text references public.facilities(id),
  service_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(service_ids) = 'array'),
  urgency text not null,
  score numeric(5,2) check (score is null or (score >= 0 and score <= 100)),
  score_breakdown jsonb not null default '{}'::jsonb,
  why_selected jsonb not null default '[]'::jsonb,
  cost_summary jsonb not null default '{}'::jsonb,
  preparation_items jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.case_passports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  passport_code text not null,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  share_token_hash text,
  share_expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (case_id, version),
  unique (passport_code, version)
);

create table if not exists public.facility_access_feedback (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  -- Nullable for emergency/scheme-verification routes that intentionally have
  -- no normal primary facility.
  facility_id text references public.facilities(id),
  route_id uuid references public.care_routes(id) on delete set null,
  outcome text not null check (outcome in ('RECEIVED_AS_PLANNED','RECEIVED_WITH_EXTRA_COST','RIGHT_NOT_ACCEPTED','SERVICE_NOT_AVAILABLE','FACILITY_CLOSED','MISSING_DOCUMENTS','TRANSFERRED_ELSEWHERE','DID_NOT_GO','OTHER')),
  right_accepted boolean,
  service_received boolean,
  unexpected_cost boolean,
  cost_amount numeric(12,2) check (cost_amount is null or cost_amount >= 0),
  missing_documents jsonb not null default '[]'::jsonb,
  transferred_to text,
  notes text,
  submitted_at timestamptz not null default now(),
  moderation_status text not null default 'PENDING' check (moderation_status in ('PENDING','APPROVED','REJECTED','DEMO_APPROVED')),
  is_demo boolean not null default false
);

-- Keep reruns compatible with an earlier draft that declared this NOT NULL.
alter table public.facility_access_feedback alter column facility_id drop not null;

alter table public.cases drop constraint if exists cases_demo_expiry_check;
alter table public.cases add constraint cases_demo_expiry_check
  check (demo_session_id is null or expires_at is not null);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  consent_type text not null,
  granted boolean not null,
  scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Common graph-traversal, effective-date and case indexes.
create index if not exists health_rights_active_effective_idx on public.health_rights (active, effective_from, effective_to);
create index if not exists health_rights_source_idx on public.health_rights (source_id);
create index if not exists conditions_icd10_idx on public.conditions (icd10) where icd10 is not null;
create index if not exists conditions_active_idx on public.conditions (active, category);
create index if not exists symptoms_active_red_flag_idx on public.symptoms (active, red_flag);
create index if not exists symptom_condition_condition_idx on public.symptom_condition_links (condition_id);
create index if not exists condition_service_service_idx on public.condition_service_links (service_id, priority);
create index if not exists services_active_type_idx on public.services (active, type, care_level);
create index if not exists coverage_right_effective_idx on public.service_right_coverages (right_id, effective_from, effective_to, coverage_status);
create index if not exists coverage_source_idx on public.service_right_coverages (source_id);
create index if not exists areas_parent_idx on public.areas (parent_id);
create index if not exists facilities_area_active_idx on public.facilities (area_id, active);
create index if not exists facilities_coordinates_idx on public.facilities (lat, lng) where lat is not null and lng is not null;
create index if not exists facility_rights_right_idx on public.facility_rights (right_id, acceptance_status);
create index if not exists facility_services_service_idx on public.facility_services (service_id, availability_status);
create index if not exists benefits_tags_idx on public.benefits using gin (case_relevance_tags);
create index if not exists eligibility_rules_active_effective_idx on public.eligibility_rules (active, effective_from, effective_to);
create index if not exists fact_sources_entity_idx on public.fact_sources (entity_type, entity_id, predicate);
create index if not exists fact_sources_source_idx on public.fact_sources (source_id);
create index if not exists cases_user_updated_idx on public.cases (user_id, updated_at desc) where user_id is not null;
create index if not exists cases_demo_session_idx on public.cases (demo_session_id, updated_at desc) where demo_session_id is not null;
create index if not exists cases_expiry_idx on public.cases (expires_at) where expires_at is not null;
create index if not exists case_messages_case_created_idx on public.case_messages (case_id, created_at);
create index if not exists triage_case_created_idx on public.triage_assessments (case_id, created_at desc);
create index if not exists eligibility_case_idx on public.eligibility_decisions (case_id, decided_at desc);
create index if not exists care_routes_case_type_idx on public.care_routes (case_id, route_type, created_at desc);
create index if not exists passports_case_version_idx on public.case_passports (case_id, version desc);
create index if not exists passports_share_hash_idx on public.case_passports (share_token_hash) where share_token_hash is not null;
create index if not exists feedback_facility_moderated_idx on public.facility_access_feedback (facility_id, moderation_status, submitted_at desc);
create index if not exists audit_case_created_idx on public.audit_events (case_id, created_at desc);
create index if not exists consent_case_created_idx on public.consent_events (case_id, created_at desc);

create or replace function public.set_mvp_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists health_rights_set_updated_at on public.health_rights;
create trigger health_rights_set_updated_at before update on public.health_rights
for each row execute function public.set_mvp_updated_at();
drop trigger if exists cases_set_updated_at on public.cases;
create trigger cases_set_updated_at before update on public.cases
for each row execute function public.set_mvp_updated_at();

-- Active facts keep expired or future versions out of runtime resolution.
-- Supabase normally runs in UTC, while product effective dates follow Bangkok.
create or replace view public.active_service_coverages as
select src.*
from public.service_right_coverages src
join public.services s on s.id = src.service_id and s.active
join public.health_rights r on r.id = src.right_id and r.active
where src.effective_from <= (current_timestamp at time zone 'Asia/Bangkok')::date
  and (src.effective_to is null or src.effective_to >= (current_timestamp at time zone 'Asia/Bangkok')::date)
  and src.verification_status <> 'EXPIRED';

create or replace view public.active_eligibility_rules as
select er.*
from public.eligibility_rules er
join public.benefits b on b.id = er.benefit_id and b.active
where er.active
  and er.effective_from <= (current_timestamp at time zone 'Asia/Bangkok')::date
  and (er.effective_to is null or er.effective_to >= (current_timestamp at time zone 'Asia/Bangkok')::date)
  and er.verification_status <> 'EXPIRED';

create or replace view public.facility_access_summary as
select
  f.id as facility_id,
  count(faf.id) filter (where faf.moderation_status in ('APPROVED','DEMO_APPROVED'))::integer as sample_size,
  count(faf.id) filter (
    where faf.moderation_status in ('APPROVED','DEMO_APPROVED')
      and faf.outcome in ('RECEIVED_AS_PLANNED','RECEIVED_WITH_EXTRA_COST')
  )::integer as success_count,
  count(faf.id) filter (where faf.moderation_status = 'APPROVED' and not faf.is_demo)::integer as real_sample_size,
  count(faf.id) filter (where faf.moderation_status = 'DEMO_APPROVED' and faf.is_demo)::integer as demo_sample_size,
  max(faf.submitted_at) filter (where faf.moderation_status in ('APPROVED','DEMO_APPROVED')) as last_confirmation_at
from public.facilities f
left join public.facility_access_feedback faf on faf.facility_id = f.id
group by f.id;

create or replace view public.care_route_candidate_view as
select
  f.id as facility_id,
  f.name_th as facility_name_th,
  f.facility_type,
  f.care_level,
  f.area_id,
  a.area_code,
  a.name_th as area_name_th,
  f.lat,
  f.lng,
  f.phone,
  f.map_url,
  f.opening_hours,
  f.call_before_visit,
  f.data_updated_at,
  f.verification_status as facility_verification_status,
  fs.service_id,
  fs.availability_status,
  fs.conditions_th as service_conditions_th,
  fr.right_id,
  fr.acceptance_status,
  fr.conditions_th as right_conditions_th,
  fas.sample_size,
  fas.success_count,
  fas.real_sample_size,
  fas.demo_sample_size,
  fas.last_confirmation_at,
  array_remove(array[f.source_id, fs.source_id, fr.source_id], null) as evidence_ids
from public.facilities f
join public.areas a on a.id = f.area_id
join public.facility_services fs on fs.facility_id = f.id
join public.facility_rights fr on fr.facility_id = f.id
left join public.facility_access_summary fas on fas.facility_id = f.id
where f.active
  and f.effective_from <= (current_timestamp at time zone 'Asia/Bangkok')::date
  and (f.effective_to is null or f.effective_to >= (current_timestamp at time zone 'Asia/Bangkok')::date)
  and fs.availability_status in ('AVAILABLE','AVAILABLE_CONDITIONAL')
  and fs.effective_from <= (current_timestamp at time zone 'Asia/Bangkok')::date
  and (fs.effective_to is null or fs.effective_to >= (current_timestamp at time zone 'Asia/Bangkok')::date)
  and fr.effective_from <= (current_timestamp at time zone 'Asia/Bangkok')::date
  and (fr.effective_to is null or fr.effective_to >= (current_timestamp at time zone 'Asia/Bangkok')::date)
  and f.verification_status <> 'EXPIRED'
  and fs.verification_status <> 'EXPIRED'
  and fr.verification_status <> 'EXPIRED';

-- Returns deterministic base scoring. Application layer adds up to 15 points for
-- requested-time/opening-hours and computes Haversine distance when coordinates exist.
create or replace function public.match_care_route_candidates(
  p_service_ids text[],
  p_right_id text,
  p_area_code text default null,
  p_limit integer default 10
) returns table (
  facility_id text,
  facility_name_th text,
  matched_service_ids text[],
  acceptance_status text,
  area_code text,
  base_score numeric,
  score_breakdown jsonb,
  warning_th text,
  evidence_ids text[]
) language sql stable security invoker set search_path = public, pg_temp as $$
  with candidates as (
    select
      c.facility_id,
      max(c.facility_name_th) as facility_name_th,
      array_agg(distinct c.service_id) as matched_service_ids,
      max(c.acceptance_status) as acceptance_status,
      max(c.area_code) as area_code,
      max(c.facility_verification_status) as facility_verification_status,
      max(coalesce(c.sample_size, 0)) as sample_size,
      max(coalesce(c.success_count, 0)) as success_count,
      array_agg(distinct evidence_id) filter (where evidence_id is not null) as evidence_ids
    from public.care_route_candidate_view c
    cross join lateral unnest(c.evidence_ids) as evidence_id
    where c.service_id = any(p_service_ids)
      and c.right_id = p_right_id
    group by c.facility_id
  )
  select
    c.facility_id,
    c.facility_name_th,
    c.matched_service_ids,
    c.acceptance_status,
    c.area_code,
    (
      35
      + case c.acceptance_status when 'ACCEPTED' then 25 when 'CONDITIONAL' then 15 else 0 end
      + case when p_area_code is not null and c.area_code = p_area_code then 10 else 0 end
      + case when c.facility_verification_status = 'VERIFIED' then 10 else 5 end
      + case when c.sample_size >= 3 then least(5, round((c.success_count::numeric / nullif(c.sample_size, 0)) * 5)) else 0 end
    )::numeric as base_score,
    jsonb_build_object(
      'service_match', 35,
      'right_match', case c.acceptance_status when 'ACCEPTED' then 25 when 'CONDITIONAL' then 15 else 0 end,
      'open_at_requested_time', null,
      'area_or_distance_match', case when p_area_code is not null and c.area_code = p_area_code then 10 else 0 end,
      'source_freshness_and_verification', case when c.facility_verification_status = 'VERIFIED' then 10 else 5 end,
      'observed_access_reliability', case when c.sample_size >= 3 then least(5, round((c.success_count::numeric / nullif(c.sample_size, 0)) * 5)) else 0 end
    ) as score_breakdown,
    case
      when c.acceptance_status = 'UNKNOWN' then 'ยังต้องยืนยันการรับสิทธิ์กับสถานพยาบาล'
      else 'เวลาเปิดและการรับสิทธิ์อาจเปลี่ยนแปลง โปรดโทรยืนยันก่อนเดินทาง'
    end as warning_th,
    coalesce(c.evidence_ids, array[]::text[]) as evidence_ids
  from candidates c
  order by base_score desc, (p_area_code is not null and c.area_code = p_area_code) desc, c.facility_name_th
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- RLS: knowledge is read-only to clients; personal data is case-owner scoped.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'source_documents','agencies','health_rights','conditions','symptoms',
    'symptom_condition_links','services','condition_service_links','service_right_coverages',
    'areas','facilities','facility_rights','facility_services','benefits','eligibility_rules',
    'safety_rules','fact_sources'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists knowledge_read on public.%I', table_name);
    execute format('create policy knowledge_read on public.%I for select to anon, authenticated using (true)', table_name);
    execute format('grant select on public.%I to anon, authenticated', table_name);
  end loop;
end $$;

create or replace function public.can_access_mvp_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.cases c
    where c.id = p_case_id
      and (
        (auth.uid() is not null and c.user_id = auth.uid())
        or (
          c.demo_session_id is not null
          and c.demo_session_id = coalesce(auth.jwt() ->> 'demo_session_id', '')
        )
      )
  );
$$;
revoke all on function public.can_access_mvp_case(uuid) from public;
grant execute on function public.can_access_mvp_case(uuid) to anon, authenticated, service_role;

-- Demo rows are temporary by contract. The server invokes this opportunistically;
-- operators may also schedule `select public.purge_expired_demo_cases();`.
create or replace function public.purge_expired_demo_cases()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count bigint;
begin
  delete from public.cases
  where demo_session_id is not null
    and expires_at is not null
    and expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.purge_expired_demo_cases() from public;
grant execute on function public.purge_expired_demo_cases() to service_role;

-- Do not require pg_cron, but schedule hourly retention automatically when the
-- project already has it enabled. Deployments without pg_cron still purge on
-- demo writes and may schedule the same SELECT through their platform runner.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1 from cron.job where jobname = 'purge-expired-rusit-demo-cases'
    ) then
      perform cron.schedule(
        'purge-expired-rusit-demo-cases',
        '17 * * * *',
        'select public.purge_expired_demo_cases();'
      );
    end if;
  end if;
exception
  when insufficient_privilege or undefined_table or undefined_function then
    raise notice 'pg_cron retention schedule not installed; use the documented external schedule';
end $$;

alter table public.cases enable row level security;
drop policy if exists case_owner_access on public.cases;
create policy case_owner_access on public.cases for all to anon, authenticated
using (
  (auth.uid() is not null and user_id = auth.uid())
  or (demo_session_id is not null and demo_session_id = coalesce(auth.jwt() ->> 'demo_session_id', ''))
)
with check (
  (auth.uid() is not null and user_id = auth.uid())
  or (demo_session_id is not null and demo_session_id = coalesce(auth.jwt() ->> 'demo_session_id', ''))
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'case_slots','case_messages','facility_access_feedback','consent_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists case_owner_access on public.%I', table_name);
    execute format(
      'create policy case_owner_access on public.%I for all to anon, authenticated using (public.can_access_mvp_case(case_id)) with check (public.can_access_mvp_case(case_id))',
      table_name
    );
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['eligibility_decisions','care_routes','case_passports'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists case_owner_read on public.%I', table_name);
    execute format(
      'create policy case_owner_read on public.%I for select to anon, authenticated using (public.can_access_mvp_case(case_id))',
      table_name
    );
  end loop;
end $$;

grant select, insert, update, delete on public.cases to anon, authenticated;
grant select, insert, update, delete on public.case_slots to anon, authenticated;
grant select, insert, update, delete on public.case_messages to anon, authenticated;
grant select, insert, update, delete on public.facility_access_feedback to anon, authenticated;
grant select, insert on public.consent_events to anon, authenticated;
grant select on public.eligibility_decisions to anon, authenticated;
grant select on public.care_routes to anon, authenticated;
grant select on public.case_passports to anon, authenticated;

-- Raw provider output and audit payloads remain server-only; no client policies.
alter table public.triage_assessments enable row level security;
alter table public.audit_events enable row level security;

grant select on public.active_service_coverages to anon, authenticated;
grant select on public.active_eligibility_rules to anon, authenticated;
grant select on public.facility_access_summary to anon, authenticated;
grant select on public.care_route_candidate_view to anon, authenticated;
grant execute on function public.match_care_route_candidates(text[], text, text, integer) to anon, authenticated, service_role;

comment on table public.triage_assessments is 'Server-only raw/normalized model assessment. provider_internal must never be returned to clients.';
comment on table public.case_passports is 'Share links are served only through server APIs using opaque tokens; only token hashes are stored.';
comment on table public.facility_access_feedback is 'Observed access reports do not overwrite official facts. Demo rows must set is_demo=true.';
comment on function public.match_care_route_candidates(text[], text, text, integer) is 'Deterministic candidate base score; app layer supplies opening-hours and Haversine components.';
comment on function public.purge_expired_demo_cases() is 'Deletes only expired demo cases; cascades their temporary snapshots, routes, passports, feedback and audits.';

commit;
