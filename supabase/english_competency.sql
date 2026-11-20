-- English Competency assessment
-- Run this once in the Supabase SQL editor.
-- Both tables are only accessed from the server (service role key), so RLS is
-- enabled with no policies: the anon key in the browser cannot read or write them.

create extension if not exists pgcrypto;

create table if not exists public.competency_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.competency_attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_name text not null,
  candidate_email text not null,
  topic_id uuid references public.competency_topics(id) on delete set null,
  topic_title text,
  -- started -> (followup) -> completed
  status text not null default 'started'
    check (status in ('started', 'followup', 'completed')),
  transcript text,
  metrics jsonb,
  followup_question text,
  followup_transcript text,
  followup_metrics jsonb,
  report jsonb,
  overall_score integer,
  cefr_level text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists competency_attempts_email_idx
  on public.competency_attempts (lower(candidate_email));

alter table public.competency_topics enable row level security;
alter table public.competency_attempts enable row level security;

-- A few starter topics (edit or remove them from the admin page).
insert into public.competency_topics (title, description)
select * from (values
  ('Your favourite way to stay healthy', 'Describe what you do to stay healthy and why it works for you.'),
  ('A challenge you overcame', 'Talk about a difficult situation, what you did, and what you learned.'),
  ('Your dream job', 'Describe the job you would love to have and explain why.'),
  ('Technology in daily life', 'Is technology making our lives better or worse? Give your opinion with examples.')
) as t(title, description)
where not exists (select 1 from public.competency_topics);
