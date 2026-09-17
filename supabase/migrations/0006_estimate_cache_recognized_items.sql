-- ============================================================
-- NightSave v0.2 — structured multi-item estimates in the cache
-- Paste into Supabase → SQL Editor → Run.
-- Appends to 0003_estimate_cache.sql; does not edit it.
-- ============================================================

alter table public.estimate_cache
  add column if not exists recognized_items jsonb,
  add column if not exists schema_version integer not null default 1;

comment on column public.estimate_cache.item_price is
  'Food subtotal: sum(quantity * estimatedUnitPrice) across recognized_items (schema_version 2+). For schema_version 1 rows this was a single item''s price.';
comment on column public.estimate_cache.recognized_items is
  'Structured [{name, quantity, estimatedUnitPrice}] the model identified for this order. Null on rows written before multi-item support (schema_version 1).';
comment on column public.estimate_cache.schema_version is
  'Cached-payload shape version. The API only reads rows matching its current version (see CACHE_SCHEMA_VERSION in lib/estimateCache.js), so older rows are left in place — never blindly purged — and simply expire on their normal 24h TTL instead of being served back as if they were structured multi-item estimates.';

-- Not strictly required (lookups filter by the unique cache_key first, this
-- column only narrows further), but keeps a version-only scan cheap if ever
-- needed for backfills or debugging.
create index if not exists estimate_cache_schema_version_idx
  on public.estimate_cache (schema_version);
