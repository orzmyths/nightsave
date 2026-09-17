-- ============================================================
-- Carry completed_at through guest -> account migration.
-- Without this, a guest goal that already crossed its target loses that
-- one-time marker on migration, which could let the completion celebration
-- (Home screen) replay after sign-in if the goal's target is later raised.
-- Paste into Supabase -> SQL Editor -> Run.
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

  insert into public.goals (id, user_id, name, target_amount, is_active, status, completed_at, created_at)
  select (g->>'id')::uuid, uid, g->>'name', (g->>'target_amount')::numeric,
         coalesce((g->>'is_active')::boolean, false),
         coalesce(g->>'status', 'active'),
         nullif(g->>'completed_at','')::timestamptz,
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
