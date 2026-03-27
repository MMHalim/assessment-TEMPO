create extension if not exists pgcrypto;

create table if not exists public.assessment_sections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text null,
  sort_order int not null default 0,
  time_limit_seconds int not null default 600,
  created_at timestamptz not null default now()
);

-- In case the table already exists, add the column if missing
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='assessment_sections' and column_name='time_limit_seconds') then
    alter table public.assessment_sections add column time_limit_seconds int not null default 600;
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'assessment_question_type') then
    create type public.assessment_question_type as enum ('mcq', 'spoken');
  end if;
end$$;

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.assessment_sections(id) on delete cascade,
  question_type public.assessment_question_type not null default 'mcq',
  prompt text not null,
  choice_a text null,
  choice_b text null,
  choice_c text null,
  choice_d text null,
  correct_choice char(1) null check (correct_choice in ('A','B','C','D')),
  points int not null default 1 check (points >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_name text not null,
  candidate_email text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  total_score int null,
  max_score int null
);

create table if not exists public.assessment_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  selected_choice char(1) null check (selected_choice in ('A','B','C','D')),
  score_awarded int null check (score_awarded >= 0),
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create or replace function public.set_assessment_answer_score()
returns trigger
language plpgsql
as $$
declare
  q record;
begin
  select question_type, correct_choice, points
  into q
  from public.assessment_questions
  where id = new.question_id;

  if q.question_type = 'spoken' then
    new.score_awarded := null;
    return new;
  end if;

  if new.selected_choice is null or q.correct_choice is null then
    new.score_awarded := 0;
    return new;
  end if;

  if new.selected_choice = q.correct_choice then
    new.score_awarded := q.points;
  else
    new.score_awarded := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_assessment_answer_score on public.assessment_attempt_answers;
create trigger trg_set_assessment_answer_score
before insert or update of selected_choice, question_id
on public.assessment_attempt_answers
for each row
execute function public.set_assessment_answer_score();

alter table public.assessment_sections enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_attempt_answers enable row level security;

drop policy if exists "anon_select_sections" on public.assessment_sections;
create policy "anon_select_sections"
on public.assessment_sections
for select
to anon, authenticated
using (true);

drop policy if exists "anon_update_sections" on public.assessment_sections;
create policy "anon_update_sections"
on public.assessment_sections
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "anon_select_questions" on public.assessment_questions;
create policy "anon_select_questions"
on public.assessment_questions
for select
to anon, authenticated
using (true);

drop policy if exists "anon_insert_questions" on public.assessment_questions;
create policy "anon_insert_questions"
on public.assessment_questions
for insert
to anon, authenticated
with check (true);

drop policy if exists "anon_update_questions" on public.assessment_questions;
create policy "anon_update_questions"
on public.assessment_questions
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "anon_delete_questions" on public.assessment_questions;
create policy "anon_delete_questions"
on public.assessment_questions
for delete
to anon, authenticated
using (true);

drop policy if exists "anon_insert_attempts" on public.assessment_attempts;
create policy "anon_insert_attempts"
on public.assessment_attempts
for insert
to anon, authenticated
with check (true);

drop policy if exists "anon_update_attempts" on public.assessment_attempts;
create policy "anon_update_attempts"
on public.assessment_attempts
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "anon_delete_attempts" on public.assessment_attempts;
create policy "anon_delete_attempts"
on public.assessment_attempts
for delete
to anon, authenticated
using (true);

drop policy if exists "anon_insert_answers" on public.assessment_attempt_answers;
create policy "anon_insert_answers"
on public.assessment_attempt_answers
for insert
to anon, authenticated
with check (true);

drop policy if exists "anon_update_answers" on public.assessment_attempt_answers;
create policy "anon_update_answers"
on public.assessment_attempt_answers
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "anon_select_answers" on public.assessment_attempt_answers;
create policy "anon_select_answers"
on public.assessment_attempt_answers
for select
to anon, authenticated
using (true);

insert into public.assessment_sections (slug, title, description, sort_order)
values
  ('general_english', 'General English', 'C1 Level Question Bank', 1),
  ('call_center', 'Call Center Protocols & Metrics', null, 2),
  ('usa_culture', 'USA General Culture', null, 3),
  ('sales_retention', 'Sales & Retention', null, 4),
  ('virtual_fitness', 'Virtual Fitness Knowledge', null, 5),
  ('spoken_english', 'Spoken English', 'Pronunciation Test', 6)
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- Insert sample questions for General English section
DO $$
DECLARE
  v_section_id uuid;
BEGIN
  SELECT id INTO v_section_id FROM public.assessment_sections WHERE slug = 'general_english';

  IF v_section_id IS NOT NULL THEN
    INSERT INTO public.assessment_questions 
      (section_id, prompt, question_type, choice_a, choice_b, choice_c, choice_d, correct_choice, points, sort_order)
    VALUES
      (v_section_id, 'Not only ______ the customer''s issue, but she also offered a complimentary month of the virtual trainer.', 'mcq', 'she resolved', 'did she resolve', 'she did resolve', 'has she resolved', 'B', 1, 1),
      (v_section_id, 'If the application''s servers hadn''t crashed yesterday, we ______ so many backlog tickets today.', 'mcq', 'wouldn''t have', 'didn''t have', 'won''t have', 'hadn''t had', 'A', 1, 2),
      (v_section_id, 'The customer''s billing profile is completely empty; they ______ their subscription last month.', 'mcq', 'must cancel', 'should have canceled', 'must have canceled', 'can have canceled', 'C', 1, 3),
      (v_section_id, 'The new virtual fitness modules ______ by the end of next quarter.', 'mcq', 'will implement', 'will be implementing', 'will have been implemented', 'have been implemented', 'C', 1, 4),
      (v_section_id, 'The client, ______ complaint was escalated to the floor manager, finally received a full refund for the dumbbells.', 'mcq', 'who', 'whom', 'whose', 'which', 'C', 1, 5),
      (v_section_id, 'Quality Assurance insisted that the agent ______ the standard greeting protocol strictly.', 'mcq', 'follows', 'follow', 'followed', 'is following', 'B', 1, 6),
      (v_section_id, '______ the workout plan on the app, the user felt exhausted but highly accomplished.', 'mcq', 'Having completed', 'Completed', 'To complete', 'Complete', 'A', 1, 7),
      (v_section_id, 'The agent''s ______ tone helped calm the irate caller down quickly.', 'mcq', 'abrasive', 'soothing', 'erratic', 'volatile', 'B', 1, 8),
      (v_section_id, 'We need to ask the right probing questions to identify the ______ cause of these app crashes.', 'mcq', 'base', 'root', 'core', 'deep', 'B', 1, 9),
      (v_section_id, 'The customer was highly ______, refusing to accept any of the proposed troubleshooting steps.', 'mcq', 'intransigent', 'complacent', 'apologetic', 'submissive', 'A', 1, 10),
      (v_section_id, 'Due to a minor technical ______, the exercise video paused mid-workout.', 'mcq', 'glitch', 'blunder', 'oversight', 'faux pas', 'A', 1, 11),
      (v_section_id, 'It is ______ that you verify the user''s email address before making any changes to their account.', 'mcq', 'imperative', 'optional', 'trivial', 'suggested', 'A', 1, 12),
      (v_section_id, 'The new smart dumbbells we sell are practically ______, taking up very little space in an apartment.', 'mcq', 'colossal', 'obsolete', 'compact', 'cumbersome', 'C', 1, 13),
      (v_section_id, 'The representative gave a ______ explanation of the billing cycle, leaving no room for confusion.', 'mcq', 'convoluted', 'lucid', 'vague', 'dubious', 'B', 1, 14),
      (v_section_id, 'Please hold for just a moment while I ______ your subscription details in our system.', 'mcq', 'look up', 'look over', 'look out', 'look down', 'A', 1, 15),
      (v_section_id, 'We need to ______ the launch of the new app update until the software bugs are completely fixed.', 'mcq', 'put off', 'put up', 'put out', 'put through', 'A', 1, 16),
      (v_section_id, 'After hearing the benefits, the customer decided to ______ with the premium annual plan.', 'mcq', 'go off', 'go ahead', 'go back', 'go down', 'B', 1, 17),
      (v_section_id, 'Since this is a complex hardware defect with the squat rack, I''ll need to ______ this issue to Tier 2 support.', 'mcq', 'elevate', 'escalate', 'promote', 'lift', 'B', 1, 18),
      (v_section_id, 'To ensure we are on the same page, let''s ______ the details of our 30-day return policy.', 'mcq', 'run over', 'run through', 'run out', 'run into', 'B', 1, 19),
      (v_section_id, 'Our team is completely swamped right now; we are ______ with calls due to the holiday promotion.', 'mcq', 'snowed under', 'rained out', 'clouded over', 'stormed in', 'A', 1, 20),
      (v_section_id, 'Our virtual trainers are exceptionally adept ______ modifying heavy lifting exercises for beginners.', 'mcq', 'at', 'to', 'in', 'for', 'A', 1, 21),
      (v_section_id, '______ the high volume of incoming chats, our wait times are slightly longer than usual.', 'mcq', 'Because', 'Due to', 'Since', 'As a result', 'B', 1, 22),
      (v_section_id, 'The company prides itself ______ its excellent customer retention and high CSAT scores.', 'mcq', 'in', 'on', 'about', 'with', 'B', 1, 23),
      (v_section_id, '______ you encounter an error code on the screen, please restart the application immediately.', 'mcq', 'Unless', 'Provided', 'Should', 'Whether', 'C', 1, 24),
      (v_section_id, 'We offer a 30-day money-back guarantee, ______ ensuring complete peace of mind for our buyers.', 'mcq', 'thereby', 'however', 'furthermore', 'nevertheless', 'A', 1, 25);
  END IF;
END $$;
