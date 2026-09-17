-- ============================================================
-- NightSave v0.2 — shared estimate cache
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Appends to 0001_init.sql / 0002_grants.sql; does not edit them.
-- ============================================================

-- gen_random_uuid() lives in pgcrypto; Supabase usually has it enabled
-- already, this is just a safe no-op if so.
create extension if not exists pgcrypto;

-- ---------- estimate_cache ----------
-- Application infrastructure, NOT user data: it holds previously-validated
-- LLM pricing estimates keyed by normalized (food, city, zip, reply_locale),
-- so a repeat search can skip the LLM round trip. It is never user-owned
-- History and never receives the user's edited Confirmed Amount.
create table public.estimate_cache (
  id                      uuid primary key default gen_random_uuid(),
  -- sha256 hex of the normalized (food, city, zip, reply_locale) tuple.
  -- Hashing avoids delimiter-collision edge cases in the food string.
  cache_key               text not null unique,

  normalized_food         text not null,
  normalized_city         text not null,
  normalized_zip          text not null,
  reply_locale            text not null default 'en',

  name                    text not null,
  item_price              numeric(12,2),
  estimated_tax_rate      numeric(10,4),
  estimated_tax           numeric(12,2),
  estimated_service_fee   numeric(12,2),
  estimated_delivery_fee  numeric(12,2),
  low                     numeric(12,2) not null check (low >= 0),
  high                    numeric(12,2) not null check (high >= 0),
  typical                 numeric(12,2) not null check (typical > 0),
  note                    text,

  created_at              timestamptz not null default now(),
  expires_at              timestamptz not null
);

-- Lookup path is always by cache_key; the unique constraint above already
-- gives us an index, and upserts use it as the conflict target so a
-- normalized (food, city, zip, reply_locale) tuple can never have more
-- than one active row.
create index estimate_cache_expires_idx on public.estimate_cache (expires_at);

-- ============================================================
-- Row Level Security — default deny.
-- estimate_cache is shared infra, not a per-user row a client should ever
-- read or write directly. No policies are created here, and no grants are
-- issued to anon/authenticated (unlike profiles/goals/decisions in
-- 0002_grants.sql). Only the service_role key — used solely by the
-- server-side /api/estimate route, never sent to the browser — can reach
-- this table, because service_role bypasses RLS entirely.
-- ============================================================
alter table public.estimate_cache enable row level security;
