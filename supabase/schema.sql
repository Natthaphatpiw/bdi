-- =============================================================================
-- รู้สิทธิ์ รู้สุข — Supabase schema (SQL + Vector)
-- One database does both: Postgres (users/sessions/audit) + pgvector (RAG)
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste this whole file → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS / OR REPLACE).
--
-- EMBEDDING DIMENSION = 768  (Google text-embedding-004).
--   If you switch model, change every `vector(768)` below to your model's dim
--   (e.g. BGE-m3 = 1024, gemini-embedding-001 = 1536/3072) and re-embed.
-- =============================================================================

create extension if not exists vector;      -- pgvector (vector type + ANN index)
create extension if not exists pg_trgm;     -- trigram (hybrid keyword search, Thai-friendly)

-- =============================================================================
-- A) PUBLIC CIVIC LAYER  (no PII · read by everyone · written by backend only)
--    These mirror / index the Neo4j Civic Knowledge Graph.
-- =============================================================================

-- A.1  GraphRAG explanatory chunks (1 row per Neo4j node) — for "explain + cite"
create table if not exists kg_chunks (
  id            uuid primary key default gen_random_uuid(),
  node_id       text not null unique,          -- Neo4j id, e.g. 'SVC_DIALYSIS'
  label         text not null,                 -- Condition / Service / Benefit ...
  name          text,                          -- readable Thai name
  text_th       text not null,                 -- NL description (what we embed)
  source_url    text,
  source_title  text,
  publisher     text,
  effective_date text,
  confidence    text,
  review_required boolean default false,
  embedding     vector(768),
  updated_at    timestamptz default now()
);

-- A.2  Text-to-Cypher few-shots — drives template-first query selection
create table if not exists kg_fewshots (
  id            uuid primary key default gen_random_uuid(),
  nl_question_th text not null,                -- example user question (we embed this)
  description   text,
  intent_tag    text,                          -- symptom_triage / rights_discovery ...
  template_id   text,                          -- 'R1','R2','Q4',...
  cypher        text not null,                 -- full Cypher (few-shot / fallback)
  param_schema  jsonb default '{}'::jsonb,
  embedding     vector(768),
  updated_at    timestamptz default now()
);

-- ANN indexes (cosine). HNSW = accurate + fast for this scale.
create index if not exists kg_chunks_embedding_idx   on kg_chunks   using hnsw (embedding vector_cosine_ops);
create index if not exists kg_fewshots_embedding_idx on kg_fewshots using hnsw (embedding vector_cosine_ops);
create index if not exists kg_chunks_label_idx       on kg_chunks (label);
create index if not exists kg_fewshots_intent_idx    on kg_fewshots (intent_tag);
create index if not exists kg_chunks_text_trgm       on kg_chunks   using gin (text_th gin_trgm_ops);

-- RLS: civic data is public-read; writes only via service_role (which bypasses RLS)
alter table kg_chunks   enable row level security;
alter table kg_fewshots enable row level security;
drop policy if exists kg_chunks_read   on kg_chunks;
drop policy if exists kg_fewshots_read on kg_fewshots;
create policy kg_chunks_read   on kg_chunks   for select to anon, authenticated using (true);
create policy kg_fewshots_read on kg_fewshots for select to anon, authenticated using (true);

-- =============================================================================
-- B) PERSONAL LAYER  (PII · isolated · RLS per user · consented · deletable)
--    user_id = Supabase auth user id (auth.users.id). NEVER store national ID.
-- =============================================================================

create table if not exists profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  birth_year    int,                            -- store year, derive age at query time
  scheme        text check (scheme in ('UCS','SSS','CSMBS') or scheme is null),
  area_code     text,
  sss_section   int,                            -- 33/39/40 (SSS only)
  receives_state_pension boolean,               -- null = unknown -> ask
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  scope         text not null,                  -- chat / phr / wearable / doc
  granted       boolean not null default false,
  updated_at    timestamptz default now(),
  unique (user_id, scope)
);

create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  channel       text,                           -- line / web
  status        text default 'open',
  started_at    timestamptz default now()
);

-- the slot-filling loop state (orchestrator reads/writes this each turn)
create table if not exists session_state (
  session_id    uuid primary key references sessions(id) on delete cascade,
  intent        text,
  slots         jsonb default '{}'::jsonb,      -- {age, scheme, area_code, symptoms[], ...}
  pending_question text,
  updated_at    timestamptz default now()
);

create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  role          text not null,                  -- user / assistant / tool
  content       text,
  created_at    timestamptz default now()
);

create table if not exists user_conditions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  condition_id  text not null,                  -- -> Neo4j Condition id
  since         date,
  source        text,                           -- chat / phr
  status        text,
  unique (user_id, condition_id)
);

create table if not exists screening_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  service_id    text not null,                  -- -> Neo4j Service id
  done_date     date,
  source        text
);

create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  doc_type      text,                           -- policy / lab
  storage_path  text,                           -- Supabase Storage object path
  status        text default 'uploaded',
  created_at    timestamptz default now()
);

-- per-user document chunks (e.g. company insurance policy PDF) — RAG, user-scoped
create table if not exists user_doc_chunks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  document_id   uuid not null references documents(id) on delete cascade,
  chunk_text    text not null,
  page          text,
  embedding     vector(768),
  created_at    timestamptz default now()
);
create index if not exists user_doc_chunks_embedding_idx on user_doc_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists user_doc_chunks_user_idx      on user_doc_chunks (user_id);

-- transparency / audit: what queries ran, which rules passed, what was cited
create table if not exists audit_log (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references sessions(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  queries_run   jsonb,
  rule_traces   jsonb,
  citations     jsonb,
  prescreen_result jsonb,
  created_at    timestamptz default now()
);

create table if not exists proactive_nudges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  service_id    text,
  reason        text,
  status        text default 'pending',
  due_date      date
);

create table if not exists feedback (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references sessions(id) on delete cascade,
  rating        int,
  note          text,
  created_at    timestamptz default now()
);

-- RLS for all personal tables: a user can only touch their own rows
do $$
declare t text;
begin
  foreach t in array array['profiles','consents','sessions','messages','user_conditions',
                           'screening_history','documents','user_doc_chunks','audit_log',
                           'proactive_nudges'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists own_rows on %I;', t);
  end loop;
end $$;

-- profiles keyed by user_id directly
create policy own_rows on profiles          for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on consents          for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on sessions          for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on user_conditions   for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on screening_history for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on documents         for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on user_doc_chunks   for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on audit_log         for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on proactive_nudges  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- messages/session_state/feedback are scoped via their session's owner
alter table session_state enable row level security;
alter table feedback enable row level security;
drop policy if exists own_rows on messages;
drop policy if exists own_rows on session_state;
drop policy if exists own_rows on feedback;
create policy own_rows on messages for all to authenticated
  using (exists (select 1 from sessions s where s.id = messages.session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = messages.session_id and s.user_id = auth.uid()));
create policy own_rows on session_state for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_state.session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = session_state.session_id and s.user_id = auth.uid()));
create policy own_rows on feedback for all to authenticated
  using (exists (select 1 from sessions s where s.id = feedback.session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = feedback.session_id and s.user_id = auth.uid()));

-- =============================================================================
-- C) VECTOR SEARCH FUNCTIONS (callable as Supabase RPC from the backend)
-- =============================================================================

-- C.1  GraphRAG retrieval (public)
create or replace function match_kg_chunks(
  query_embedding vector(768),
  match_count int default 5,
  label_filter text default null
) returns table (
  node_id text, label text, name text, text_th text,
  source_url text, source_title text, publisher text, similarity float
) language sql stable as $$
  select c.node_id, c.label, c.name, c.text_th,
         c.source_url, c.source_title, c.publisher,
         1 - (c.embedding <=> query_embedding) as similarity
  from kg_chunks c
  where (label_filter is null or c.label = label_filter)
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- C.2  Few-shot retrieval for template-first Cypher selection (public)
create or replace function match_kg_fewshots(
  query_embedding vector(768),
  match_count int default 3,
  intent_filter text default null
) returns table (
  template_id text, intent_tag text, nl_question_th text, cypher text,
  param_schema jsonb, similarity float
) language sql stable as $$
  select f.template_id, f.intent_tag, f.nl_question_th, f.cypher,
         f.param_schema, 1 - (f.embedding <=> query_embedding) as similarity
  from kg_fewshots f
  where (intent_filter is null or f.intent_tag = intent_filter)
    and f.embedding is not null
  order by f.embedding <=> query_embedding
  limit match_count;
$$;

-- C.3  Per-user document retrieval (pass the user id from the trusted backend)
create or replace function match_user_doc_chunks(
  query_embedding vector(768),
  p_user_id uuid,
  match_count int default 5
) returns table (
  chunk_text text, page text, document_id uuid, similarity float
) language sql stable as $$
  select d.chunk_text, d.page, d.document_id,
         1 - (d.embedding <=> query_embedding) as similarity
  from user_doc_chunks d
  where d.user_id = p_user_id and d.embedding is not null
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- =============================================================================
-- DONE. Tables + indexes + RLS + RPC functions are ready.
-- Next: seed kg_chunks (app/export_kg_chunks.py) and kg_fewshots (app/seed_fewshots.py).
-- =============================================================================
