# NightSave — Status Update (2026-09-13)

**Repo:** `nightsave` · **Branch:** `v0.2-dev` (up to date with `origin/v0.2-dev`)
**Base:** `main` is still at v0.1 (`5147eaf`); `v0.2-dev` is 2 commits ahead (`85207c8`, `3b9bac8`) plus the uncommitted work below.

## What NightSave is
A "food delivery interceptor": user types what they were about to order, gets a cost estimate (LLM-driven), and instead of ordering, banks that money toward a savings goal. Core loop: **Search → Order estimate → Save (intercept) or Eat → History/Goals tracking.**

## Where the project stands
- **v0.1 (main):** MVP — single placeholder home screen, no auth, no persistence.
- **Phase 2 (committed on v0.2-dev):** Added onboarding flow (`Onboarding.jsx`, `WelcomeStep`, `LanguageStep`, `AuthForm`), Supabase-backed auth (`lib/auth.jsx`, `lib/supabaseClient.js`), guest-vs-signed-in modes, i18n scaffolding, and a repo abstraction layer (`lib/repo/`, `lib/useRepo.js`) that switches between a local "guest" store and a Supabase "cloud" store transparently.
- **Uncommitted work in progress right now** (this session): wiring the real app UI on top of that Phase 2 foundation, replacing the placeholder home screen.

## Uncommitted changes (working tree, not yet committed)

### New: full tabbed app shell + screens
- **`components/AppShell.jsx`** *(new)* — bottom-tab nav shell (Home 🌙 / Goals 🎯 / History 📊 / Profile 👤), swaps in for the old `PlaceholderHome`.
- **`components/home/Home.jsx`** *(new, 328 lines)* — the actual product experience, ported from v0.1 and rewired onto the repo layer:
  - Goal card (progress bar, streak, edit-in-place) or empty-state "set a goal" prompt.
  - Search screen (food + city + zip) → calls `/api/estimate`.
  - Order screen (price range + typical cost) → user picks **Save** or **Eat**.
  - Intercept screen: animated "money saved" moment, updates goal progress + streak.
  - Ate screen: neutral fallback if they didn't hold off.
  - All decisions persisted via `repo.recordDecision(...)`.
- **`components/Goals.jsx`** *(new)* — full CRUD for savings goals: create/edit/delete, mark-active, per-goal progress bars, validated amount input.
- **`components/History.jsx`** *(new)* — decision log with weekly/monthly/lifetime saved stats, void-a-record support.
- **`components/Profile.jsx`** *(new)* — nickname/default city/zip, language picker (writes through `repo.setAppLanguage`), account section (sign out for signed-in users, "create account / sign in" upsell for guests).
- **`app/page.jsx`** — now renders `AppShell` instead of `PlaceholderHome` for signed-in/guest users.

### `app/api/estimate/route.js` — provider swap + zip support
- Previously called an **OpenAI-compatible** `/chat/completions` endpoint.
- Now calls an **Anthropic-style** `/v1/messages` endpoint (`x-api-key` header, `anthropic-version`, `system` field separate from `messages`, parses `content[].text` instead of `choices[0].message.content`).
- Comment says "Server-only MiniMax proxy... preserved from v0.1" but the request shape is now Anthropic's Messages API format, not MiniMax's original OpenAI-compatible shape — **worth double-checking this is intentional** (i.e. confirm `LLM_API_BASE`/`LLM_MODEL` env vars actually point at an Anthropic-compatible endpoint before deploying).
- Added `zip` as an input field, folded into the "Area" line sent to the model along with city.
- Added `console.error` logging on missing config / non-OK response / thrown errors (previously silent).
- Numbers are coerced with `Number(...)` before `Math.round` (was `Math.round(p.low)` directly — hardens against the model returning numeric strings).

### i18n: new keys across all 6 locales (en, es, ja, ko, zh-Hans, zh-Hant)
~30 new keys added per locale for the new UI: `common.*` (done/save/cancel/edit), `home.*` (goal prompts, footer copy, saving-to header), `order.*`, `intercept.*`, `history.*`, `profile.*`, `goals.*`. All 6 locale files got matching additions (need to verify translations were actually translated per-locale, not just copy-pasted English — didn't diff the non-English files line-by-line here).

## Untracked (not yet `git add`ed)
```
components/AppShell.jsx
components/Goals.jsx
components/History.jsx
components/Profile.jsx
components/home/Home.jsx
```

## Notable risks / things to sanity-check before shipping
1. **Estimate route provider mismatch** — code comment vs. actual request format disagree (MiniMax vs Anthropic Messages API). Confirm which provider is actually configured in env vars.
2. **No commit yet** — all of the above is uncommitted working-tree state on `v0.2-dev`. Nothing has been pushed.
3. **Non-English i18n additions** — added via the same diff pass as English; worth a native/LLM translation QA pass on es/ja/ko/zh-Hans/zh-Hant before release.
4. **`main` branch is still pure v0.1** — `v0.2-dev` has diverged significantly (auth, i18n, repo layer, full app UI) and hasn't been merged.

## Suggested next steps
- Verify `/api/estimate` against the real configured LLM endpoint (test a live request).
- `git add` the new components, commit, push `v0.2-dev`.
- Review/QA the 5 non-English locale files.
- Plan the `v0.2-dev` → `main` merge once the above is verified.
