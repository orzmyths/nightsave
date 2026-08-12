-- ============================================================
-- NightSave v0.2 schema
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Requires Postgres 15+ (Supabase is fine). See the SET NULL note below.
-- ============================================================

-- ---------- profiles ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nickname      text,
  avatar_url    text,
  default_city  text,
  default_zip   text,
  app_language  text not null default 'en',   -- en / zh-Hant / zh-Hans / es / ja / ko
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- goals ----------
create table public.goals (
  id            uuid primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  target_amount numeric(12,2) not null
                check (target_amount > 0 and target_amount <= 100000000),
  is_active     boolean not null default false,
  status        text not null default 'active'
                check (status in ('active','completed','archived')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- composite-FK target so decisions can enforce same-owner linkage
  unique (id, user_id),
  -- only an 'active'-status goal may be the active one
  check (not is_active or status = 'active')
);

-- at most one active goal per user, enforced by the DB
create unique index one_active_goal_per_user
  on public.goals (user_id) where is_active;
create index goals_user_idx on public.goals (user_id);

-- ---------- decisions (History, immutable content) ----------
create type decision_type as enum ('saved', 'ate');

create table public.decisions (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  food_name          text not null,
  input_locale       text,
  estimate_typical   numeric(12,2) not null check (estimate_typical >= 0),
  estimate_low       numeric(12,2) check (estimate_low  >= 0),
  estimate_high      numeric(12,2) check (estimate_high >= 0),
  city               text,
  zip                text,
  reply_locale       text,
  decision           decision_type not null,
  goal_id            uuid,
  goal_name_snapshot text,
  allocated_amount   numeric(12,2) check (allocated_amount >= 0),
  voided_at          timestamptz,               -- null = still valid
  created_at         timestamptz not null default now(),
  -- a 'saved' decision must carry an amount
  check (decision <> 'saved' or allocated_amount is not null),
  -- same-owner Goal linkage; clearing only goal_id keeps user_id intact (PG15+)
  foreign key (goal_id, user_id)
    references public.goals (id, user_id)
    on delete set null (goal_id)
);

create index decisions_user_idx   on public.decisions (user_id, created_at desc);
create index decisions_goal_idx   on public.decisions (goal_id);
create index decisions_active_idx on public.decisions (user_id) where voided_at is null;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.goals     enable row level security;
alter table public.decisions enable row level security;

create policy "own_profile_select" on public.profiles for select using (auth.uid() = id);
create policy "own_profile_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own_profile_update" on public.profiles for update using (auth.uid() = id);

create policy "own_goals_all" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- decisions: read + insert only. No update/delete policy → content is immutable.
create policy "own_decisions_select" on public.decisions
  for select using (auth.uid() = user_id);
create policy "own_decisions_insert" on public.decisions
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- Auto-create a profile row when an auth user is created
-- ============================================================
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Set active goal (atomic: unset others, set this one)
-- ============================================================
create or replace function public.set_active_goal(p_goal_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.goals set is_active = false, updated_at = now()
    where user_id = uid and is_active;
  update public.goals set is_active = true, updated_at = now()
    where id = p_goal_id and user_id = uid and status = 'active';
  if not found then raise exception 'goal not found or not active'; end if;
end; $$;

-- ============================================================
-- Void a decision (only flips voided_at; content stays untouched)
-- ============================================================
create or replace function public.void_decision(p_decision_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.decisions set voided_at = now()
    where id = p_decision_id and user_id = uid and voided_at is null;
  if not found then raise exception 'decision not found or already voided'; end if;
end; $$;

-- ============================================================
-- Guest → Account migration (single transaction, hardened)
-- Never trusts client-supplied user_id. Caps volume. Keeps original UUIDs.
-- ============================================================
create or replace function public.migrate_guest_data(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid   uuid  := auth.uid();
  goals jsonb := coalesce(payload->'goals', '[]'::jsonb);
  decs  jsonb := coalesce(payload->'decisions', '[]'::jsonb);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(payload) <> 'object' then raise exception 'invalid payload'; end if;
  if jsonb_typeof(goals) <> 'array' or jsonb_typeof(decs) <> 'array' then
    raise exception 'invalid payload arrays';
  end if;
  if jsonb_array_length(goals) > 200  then raise exception 'too many goals';     end if;
  if jsonb_array_length(decs)  > 5000 then raise exception 'too many decisions'; end if;

  update public.profiles set
    default_city = coalesce(payload->'profile'->>'city', default_city),
    default_zip  = coalesce(payload->'profile'->>'zip',  default_zip),
    app_language = coalesce(payload->'profile'->>'language', app_language),
    updated_at   = now()
  where id = uid;

  insert into public.goals (id, user_id, name, target_amount, is_active, status, created_at)
  select (g->>'id')::uuid, uid, g->>'name', (g->>'target_amount')::numeric,
         coalesce((g->>'is_active')::boolean, false),
         coalesce(g->>'status', 'active'),
         coalesce((g->>'created_at')::timestamptz, now())
  from jsonb_array_elements(goals) g
  on conflict (id) do nothing;

  insert into public.decisions (id, user_id, food_name, input_locale, estimate_typical,
         estimate_low, estimate_high, city, zip, reply_locale, decision,
         goal_id, goal_name_snapshot, allocated_amount, voided_at, created_at)
  select (d->>'id')::uuid, uid, d->>'food_name', d->>'input_locale',
         (d->>'estimate_typical')::numeric, (d->>'estimate_low')::numeric,
         (d->>'estimate_high')::numeric, d->>'city', d->>'zip', d->>'reply_locale',
         (d->>'decision')::decision_type, nullif(d->>'goal_id','')::uuid,
         d->>'goal_name_snapshot', (d->>'allocated_amount')::numeric,
         nullif(d->>'voided_at','')::timestamptz,
         coalesce((d->>'created_at')::timestamptz, now())
  from jsonb_array_elements(decs) d
  on conflict (id) do nothing;
end; $$;
