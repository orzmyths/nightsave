"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "../../lib/i18n";
import { useRepo } from "../../lib/useRepo";
import { T, card, input, btn, label } from "../../lib/ui/theme";
import { MAX_INPUT_LEN, MAX_ITEMS } from "../../lib/orderLimits";

const money = (n) => "$" + Number(n || 0).toFixed(2);

// A cache hit (~125-150ms observed) should never see the rich loading
// screen at all; only a genuine LLM round trip (seconds) crosses this.
const LOADING_THRESHOLD_MS = 700;
const LOADING_MESSAGE_ROTATE_MS = 1800;
// Final safety net in case the API route or connection itself gets stuck —
// intentionally above the server's own 30s M3 timeout, so a well-behaved
// server-side timeout response is the one that normally wins the race.
const CLIENT_TIMEOUT_MS = 35_000;
const LOADING_MESSAGE_KEYS = [
  "loading.msg1",
  "loading.msg2",
  "loading.msg3",
  "loading.msg4",
  "loading.msg5",
];

// The real NightSave experience, backed by the repo layer.
// Guest -> guestRepo (local), signed-in -> cloudRepo (Supabase). useRepo() decides.
export default function Home({ active = true, onNavigate }) {
  const { t, locale } = useI18n();
  const repo = useRepo();

  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState("search"); // search | loading | order | intercept | ate | error | celebrate | toobig
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState(null);          // AI estimate + breakdown (immutable view)
  const [confirmed, setConfirmed] = useState(0);    // user-confirmed amount used for Save/Eat
  const [lastDecision, setLastDecision] = useState(null);
  const [celebration, setCelebration] = useState(null); // goal-completion crossing, shown once
  const [orderIssue, setOrderIssue] = useState(null);   // "too_many_items" | "quantity_too_high" | "total_quantity_too_high" | "input_too_long"
  const [errorKind, setErrorKind] = useState(null);     // null | "timeout" — which ErrorScreen body text to show
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const requestIdRef = useRef(0);      // bumped on every estimate() call — guards stale responses/timers
  const loadingTimerRef = useRef(null); // the pending "promote to rich loading screen" timeout
  const estimateInFlightRef = useRef(false); // synchronous re-entry guard — `loading` state updates
                                              // asynchronously, so it can't reliably stop a same-tick
                                              // double Enter/click from firing a second M3 request

  const [activeGoal, setActiveGoal] = useState(null);
  const [saved, setSaved] = useState(0);
  const [streak, setStreak] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [g, profile, decisions] = await Promise.all([
        repo.getActiveGoal(),
        repo.getProfile().catch(() => null),
        repo.listDecisions().catch(() => []),
      ]);
      setActiveGoal(g);
      setSaved(g ? await repo.savedForGoal(g.id) : 0);
      setStreak(decisions.filter((d) => d.decision === "saved" && !d.voided_at).length);
      if (!area && profile?.default_city) setArea(profile.default_city);
      if (!zip && profile?.default_zip) setZip(profile.default_zip);
    } catch {}
    setReady(true);
  }, [repo]); // eslint-disable-line

  // Home stays mounted across tab switches (see AppShell), so re-run the load
  // whenever the tab becomes active again — this replaces the old remount-driven
  // refresh without touching the in-progress search/order state below.
  useEffect(() => { if (active) loadData(); }, [active, loadData]);

  // Rotate the loading message only while the rich loading screen is actually
  // showing; the effect's own cleanup stops it the instant `screen` moves on
  // (result arrived, error, retry, reset — no separate teardown code needed).
  useEffect(() => {
    if (screen !== "loading") return;
    const id = setInterval(() => {
      setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGE_KEYS.length);
    }, LOADING_MESSAGE_ROTATE_MS);
    return () => clearInterval(id);
  }, [screen]);

  // Belt-and-suspenders: if Home ever truly unmounts (not just hidden by a
  // tab switch — see AppShell), don't leave a promotion timer pending.
  useEffect(() => () => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
  }, []);

  const pct = activeGoal ? Math.min(100, (saved / activeGoal.target_amount) * 100) : 0;

  async function estimate() {
    // Synchronous re-entry guard: set (and checked) before any `await`, so a
    // rapid double Enter/click — even one that lands before React has
    // re-rendered the disabled button — can never start a second M3 call.
    if (estimateInFlightRef.current) return;
    estimateInFlightRef.current = true;
    try {
      const q = query.trim();
      if (!q) return;
      // Instant client-side check for the one limit we already know without a
      // round trip; the server enforces this and every other limit regardless.
      if (q.length > MAX_INPUT_LEN) {
        setOrderIssue("input_too_long");
        setScreen("toobig");
        return;
      }

      // A fresh request always wins: bump the id so any older in-flight
      // request's eventual response/timer becomes a no-op, and cancel whatever
      // promotion timer that older request left pending. (In practice the
      // in-flight guard above means there's never more than one estimate()
      // running at once from this component, but this stays as a second,
      // independent line of defense against an out-of-order response.)
      const reqId = ++requestIdRef.current;
      if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }

      setLoading(true);
      // Don't show the full loading experience for a fast (likely cache-hit)
      // response — only promote to it once the request has been pending past
      // the threshold, and only if nothing newer has superseded it since.
      loadingTimerRef.current = setTimeout(() => {
        if (requestIdRef.current === reqId) {
          setLoadingMsgIndex(0);
          setScreen("loading");
        }
      }, LOADING_THRESHOLD_MS);

      // Final safety net: abort the browser request itself if the API route
      // or connection ever gets stuck well past the server's own 30s M3
      // timeout. A fresh controller/timer every call, scoped to this request.
      const abortController = new AbortController();
      const clientTimeoutId = setTimeout(() => abortController.abort(), CLIENT_TIMEOUT_MS);

      try {
        const res = await fetch("/api/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, area: area.trim(), zip: zip.trim(), reply_locale: locale }),
          signal: abortController.signal,
        });
        const p = await res.json().catch(() => null);

        if (requestIdRef.current !== reqId) return; // a newer request already took over

        if (p?.error === "order_too_large" || p?.error === "input_too_long") {
          setOrderIssue(p.reason || p.error);
          setScreen("toobig");
          return;
        }
        if (p?.error === "estimate_timeout") { setErrorKind("timeout"); setScreen("error"); return; }
        if (!res.ok || p?.error || p?.typical == null) { setErrorKind(null); setScreen("error"); return; }
        setItem(p);
        setConfirmed(Number(p.typical)); // default confirmed = AI checkout total
        setScreen("order");
      } catch (err) {
        // NEVER fabricate a price. An aborted-by-us request (35s safety net)
        // gets the same "taking longer than expected" messaging as a
        // server-reported timeout; any other failure keeps the generic copy.
        if (requestIdRef.current === reqId) {
          setErrorKind(err?.name === "AbortError" ? "timeout" : null);
          setScreen("error");
        }
      } finally {
        clearTimeout(clientTimeoutId);
        // Only the request that's still current may clear the shared timer/
        // loading flag — a stale request's cleanup must never cancel a newer
        // request's own pending timer or flip `loading` back off under it.
        if (requestIdRef.current === reqId) {
          if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
          setLoading(false);
        }
      }
    } finally {
      estimateInFlightRef.current = false;
    }
  }

  // Manual amount when the estimate is unavailable
  function useManual(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    setItem({ name: query.trim(), typical: n, low: n, high: n, manual: true });
    setConfirmed(n);
    setScreen("order");
  }

  async function decide(kind) {
    // kind: "saved" | "ate". Confirmed amount is what NightSave records.
    const amount = Number(confirmed);
    const base = {
      food_name: item.name,
      input_locale: null,
      estimate_typical: item.typical,          // AI estimate stays as the estimate
      estimate_low: item.low,
      estimate_high: item.high,
      city: area.trim() || null,
      zip: zip.trim() || null,
      reply_locale: locale,
      decision: kind,
      allocated_amount: Number.isFinite(amount) && amount > 0 ? amount : item.typical, // confirmed
    };
    const goalForDecision = activeGoal; // snapshot — loadData() below will replace `activeGoal`
    const payload =
      kind === "saved"
        ? { ...base, goal_id: goalForDecision?.id || null, goal_name_snapshot: goalForDecision?.name || null }
        : base;
    try { await repo.recordDecision(payload); } catch {}
    setLastDecision({ amount: base.allocated_amount, food: item.name });

    // Goal-completion crossing: previousSaved < target <= newSaved, and only
    // ever once per goal — `completed_at` (persisted on the goal row) is the
    // one-time guard, so a reload/tab-switch/another decision can't replay it.
    let crossed = null;
    if (kind === "saved" && goalForDecision && !goalForDecision.completed_at) {
      try {
        const newSaved = await repo.savedForGoal(goalForDecision.id);
        if (saved < goalForDecision.target_amount && newSaved >= goalForDecision.target_amount) {
          await repo.updateGoal(goalForDecision.id, { completed_at: new Date().toISOString() });
          crossed = { goalName: goalForDecision.name, saved: newSaved, target: goalForDecision.target_amount };
        }
      } catch {}
    }

    await loadData();
    if (crossed) {
      setCelebration(crossed);
      setScreen("celebrate");
    } else {
      setScreen(kind === "saved" ? "intercept" : "ate");
    }
  }

  async function saveGoal({ name, target }) {
    try {
      if (activeGoal) await repo.updateGoal(activeGoal.id, { name, target_amount: target });
      else {
        const g = await repo.createGoal({ name, target_amount: target });
        if (g && !g.is_active) await repo.setActiveGoal(g.id);
      }
    } catch {}
    setEditingGoal(false);
    await loadData();
  }

  // Invalidates any in-flight estimate() call so its eventual response/timer
  // becomes a no-op — called whenever the user explicitly leaves the
  // estimate flow instead of waiting for it to resolve on its own.
  function cancelPendingEstimate() {
    requestIdRef.current++;
    if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
    setLoading(false);
    estimateInFlightRef.current = false; // in practice already false by the time a reset-capable
                                          // screen is reachable, but never leave the lock stuck.
  }

  function reset() {
    cancelPendingEstimate();
    setQuery(""); setItem(null); setConfirmed(0); setCelebration(null); setOrderIssue(null); setErrorKind(null); setScreen("search");
  }

  // "Edit order" — back to search, but keep the query text so the user can
  // trim/adjust it instead of retyping the whole thing from scratch.
  function backToEditQuery() {
    cancelPendingEstimate();
    setItem(null); setOrderIssue(null); setErrorKind(null); setScreen("search");
  }

  if (!ready) return <div style={{ minHeight: "60vh" }} />;

  return (
    <div>
      <style>{`
        @keyframes ns-breathe{0%,100%{transform:scale(.9);opacity:.5}50%{transform:scale(1.15);opacity:1}}
        @keyframes ns-fade{from{opacity:0}to{opacity:1}}
        @keyframes ns-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @media (prefers-reduced-motion: reduce) {
          .ns-loading-icon, .ns-loading-msg { animation: none !important; }
        }
      `}</style>

      {activeGoal || editingGoal ? (
        <GoalCard goal={activeGoal} saved={saved} pct={pct} streak={streak}
          editing={editingGoal} setEditing={setEditingGoal} onSave={saveGoal} t={t} />
      ) : (
        <EmptyGoal onCreate={() => setEditingGoal(true)} t={t} />
      )}

      <div style={{ height: 22 }} />

      {/* keyed wrapper → re-runs the fade on each major state change (~240ms) */}
      <div key={screen} style={{ animation: "ns-fade 240ms ease" }}>
        {screen === "search" && (
          <SearchScreen query={query} setQuery={setQuery} area={area} setArea={setArea}
            zip={zip} setZip={setZip} loading={loading} onGo={estimate} t={t} />
        )}
        {screen === "loading" && <LoadingScreen messageIndex={loadingMsgIndex} t={t} />}
        {screen === "order" && item && (
          <OrderScreen item={item} confirmed={confirmed} setConfirmed={setConfirmed}
            hasGoal={!!activeGoal} onSave={() => decide("saved")} onAte={() => decide("ate")}
            onBack={reset} t={t} />
        )}
        {screen === "intercept" && (
          <InterceptScreen amount={lastDecision?.amount} food={lastDecision?.food}
            saved={saved} goal={activeGoal} pct={pct} streak={streak} onDone={reset} t={t} />
        )}
        {screen === "ate" && <AteScreen onDone={reset} t={t} />}
        {screen === "error" && (
          <ErrorScreen onRetry={estimate} onManual={useManual} loading={loading} timedOut={errorKind === "timeout"} t={t} />
        )}
        {screen === "celebrate" && celebration && (
          <CelebrateScreen goalName={celebration.goalName} savedAmount={celebration.saved}
            targetAmount={celebration.target} streak={streak}
            onCreateNew={() => { reset(); onNavigate?.("goals"); }}
            onKeepSaving={reset} t={t} />
        )}
        {screen === "toobig" && (
          <TooBigScreen issue={orderIssue} onEditOrder={backToEditQuery} t={t} />
        )}
      </div>
    </div>
  );
}

function EmptyGoal({ onCreate, t }) {
  return (
    <div style={{ ...card(), textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>🎯</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{t("home.setGoalTitle")}</div>
      <button style={btn(T.jade, T.bg)} onClick={onCreate}>{t("home.setGoalCta")}</button>
    </div>
  );
}

function GoalCard({ goal, saved, pct, streak, editing, setEditing, onSave, t }) {
  const [name, setName] = useState(goal?.name || "");
  const [target, setTarget] = useState(goal?.target_amount != null ? String(goal.target_amount) : "");
  const [err, setErr] = useState("");
  useEffect(() => {
    setName(goal?.name || "");
    setTarget(goal?.target_amount != null ? String(goal.target_amount) : "");
    setErr("");
  }, [goal]);

  function submit() {
    const n = Number(target);
    if (target.trim() === "" || !Number.isFinite(n) || n <= 0) { setErr(t("goals.invalidAmount")); return; }
    onSave({ name: (name || "").trim() || t("goals.title"), target: n });
  }

  if (editing) {
    return (
      <div style={card()}>
        <div style={label()}>{t("goals.name")}</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("goals.namePlaceholder")} style={input()} />
        <div style={{ height: 12 }} />
        <div style={label()}>{t("goals.target")}</div>
        <input type="text" inputMode="numeric" value={target} placeholder="800"
          onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) { setTarget(v); setErr(""); } }}
          style={input()} />
        {err && <div style={{ color: "#e08a8a", fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ height: 16 }} />
        <button style={btn(T.jade, T.bg)} onClick={submit}>{t("common.save")}</button>
      </div>
    );
  }

  return (
    <div style={card()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, letterSpacing: 2, color: T.mute }}>{t("home.savingTo")}</span>
        <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: T.mute, fontSize: 13, cursor: "pointer" }}>{t("common.edit")}</button>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{goal.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 16 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: T.jade }}>{money(saved)}</span>
        <span style={{ color: T.mute, fontSize: 15 }}>/ {money(goal.target_amount)}</span>
      </div>
      <div style={{ height: 10, background: "#0c1120", borderRadius: 99, marginTop: 12, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,#3fae83,${T.jade})`, borderRadius: 99, transition: "width .7s cubic-bezier(.2,.8,.2,1)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13, color: T.mute }}>
        {saved >= goal.target_amount ? (
          <span style={{ color: T.jade }}>{t("home.goalReached")}</span>
        ) : (
          <span>{t("home.remaining", { amt: money(goal.target_amount - saved) })}</span>
        )}
        <span>🔥 {t("home.held", { n: streak })}</span>
      </div>
    </div>
  );
}

function SearchScreen({ query, setQuery, area, setArea, zip, setZip, loading, onGo, t }) {
  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>{t("home.title")} 🌙</div>
      <div style={{ color: T.mute, fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>{t("home.searchSubtitle")}</div>
      <div style={card()}>
        <div style={label()}>{t("home.food.placeholder")}</div>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onGo()} placeholder={t("home.food.placeholder")} style={input()} />
        <div style={{ height: 12 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1.4 }}>
            <div style={label()}>{t("home.city")}</div>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="San Jose" style={input()} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={label()}>{t("home.zip")}</div>
            <input value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" placeholder="95112" style={input()} />
          </div>
        </div>
        <div style={{ height: 18 }} />
        <button style={btn(T.amber, "#241704", loading)} disabled={loading} onClick={onGo}>
          {loading ? t("home.estimating") : t("home.estimate")}
        </button>
      </div>
      <div style={{ textAlign: "center", color: T.mute, fontSize: 12, marginTop: 18, lineHeight: 1.6 }}>
        {t("home.footer")}<br />{t("home.footer2")}
      </div>
    </div>
  );
}

function BreakdownRow({ k, v, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, margin: "7px 0", color: muted ? T.mute : T.text }}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}

function OrderScreen({ item, confirmed, setConfirmed, hasGoal, onSave, onAte, onBack, t }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(confirmed));
  useEffect(() => { setDraft(String(confirmed)); }, [confirmed]);

  const hasBreakdown = item.itemPrice != null && !item.manual;
  const recognizedItems = Array.isArray(item.recognizedItems) ? item.recognizedItems : [];
  const isMulti = recognizedItems.length > 1;

  function applyDraft() {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) setConfirmed(Math.round(n * 100) / 100);
    setEditing(false);
  }

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: T.mute, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>← {t("order.change")}</button>
      <div style={card()}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          {isMulti ? t("order.multiItemTitle") : item.name}
        </div>
        {item.note ? <div style={{ color: T.mute, fontSize: 13, marginBottom: 10 }}>{item.note}</div> : null}

        {isMulti && (
          <div style={{ marginBottom: 10 }}>
            {recognizedItems.map((it, i) => (
              <div key={i} style={{ fontSize: 14, color: T.text, padding: "3px 0" }}>
                {it.name} ×{it.quantity}
              </div>
            ))}
          </div>
        )}

        {hasBreakdown && (
          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 12, paddingTop: 12 }}>
            <BreakdownRow
              k={isMulti ? t("order.foodSubtotal", { n: recognizedItems.length }) : t("order.itemEstimate")}
              v={money(item.itemPrice)} />
            {item.estimatedTax != null && (
              <BreakdownRow
                k={item.estimatedTaxRate != null ? t("order.estTax", { rate: item.estimatedTaxRate }) : t("order.estTaxNoRate")}
                v={money(item.estimatedTax)} muted />
            )}
            {item.estimatedServiceFee != null && <BreakdownRow k={t("order.serviceFee")} v={money(item.estimatedServiceFee)} muted />}
            {item.estimatedDeliveryFee != null && <BreakdownRow k={t("order.deliveryFee")} v={money(item.estimatedDeliveryFee)} muted />}
            <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 10, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 14, color: T.mute }}>{t("order.checkout")}</span>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{money(item.typical)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.mute, marginTop: 6 }}>
              <span>{t("order.likelyRange")}</span><span>{money(item.low)} – {money(item.high)}</span>
            </div>
            <div style={{ fontSize: 11, color: T.mute, marginTop: 10, fontStyle: "italic" }}>{t("order.estimateNote")}</div>
          </div>
        )}
      </div>

      {/* Confirmed amount — editable, this is what NightSave records */}
      <div style={{ ...card(), marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: T.mute }}>{t("order.confirmedAmount")}</span>
          {!editing && (
            <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: T.jade, fontSize: 13, cursor: "pointer" }}>{t("order.editAmount")}</button>
          )}
        </div>
        {editing ? (
          <div style={{ marginTop: 10 }}>
            <input type="text" inputMode="decimal" value={draft} autoFocus
              onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setDraft(v); }}
              onKeyDown={(e) => e.key === "Enter" && applyDraft()} style={input()} />
            <div style={{ height: 10 }} />
            <button style={btn(T.jade, T.bg)} onClick={applyDraft}>{t("estimate.use")}</button>
            <div style={{ color: T.mute, fontSize: 12, marginTop: 8 }}>{t("order.editHint")}</div>
          </div>
        ) : (
          <div style={{ fontSize: 30, fontWeight: 800, color: T.jade, marginTop: 6 }}>{money(confirmed)}</div>
        )}
      </div>

      <div style={{ height: 16 }} />
      <button style={btn(T.jade, T.bg)} onClick={onSave}>{t("order.save")} · {money(confirmed)}</button>
      <div style={{ height: 10 }} />
      <button style={btn("transparent", T.text)} onClick={onAte}>{t("order.eat")}</button>
      {!hasGoal && (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 12, marginTop: 12 }}>{t("home.setGoalTitle")}</div>
      )}
    </div>
  );
}

function ErrorScreen({ onRetry, onManual, loading, timedOut, t }) {
  const [manual, setManual] = useState(false);
  const [amt, setAmt] = useState("");
  return (
    <div>
      <div style={{ ...card(), textAlign: "center" }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>🌫️</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{t("estimate.unavailableTitle")}</div>
        <div style={{ color: T.mute, fontSize: 14, marginTop: 8 }}>
          {t(timedOut ? "estimate.timeoutBody" : "estimate.unavailableBody")}
        </div>
        <div style={{ height: 18 }} />
        <button style={btn(T.jade, T.bg, loading)} disabled={loading} onClick={onRetry}>
          {loading ? t("home.estimating") : t("estimate.retry")}
        </button>
        <div style={{ height: 10 }} />
        {!manual ? (
          <button style={btn("transparent", T.text)} onClick={() => setManual(true)}>{t("estimate.manualEntry")}</button>
        ) : (
          <div style={{ marginTop: 4, textAlign: "left" }}>
            <div style={label()}>{t("estimate.manualLabel")}</div>
            <input type="text" inputMode="decimal" value={amt} autoFocus
              onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setAmt(v); }}
              onKeyDown={(e) => e.key === "Enter" && onManual(amt)} placeholder="15.00" style={input()} />
            <div style={{ height: 10 }} />
            <button style={btn(T.jade, T.bg)} onClick={() => onManual(amt)}>{t("estimate.use")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingScreen({ messageIndex, t }) {
  // 5 messages, 3 icon stages — msg 1-2 "checking food/prices", msg 3 "tax
  // and fees", msg 4-5 "comparing to goal / almost there".
  const stage = messageIndex <= 1 ? 0 : messageIndex === 2 ? 1 : 2;
  const icons = ["🍜", "💰", "🎯"];
  return (
    <div style={{ textAlign: "center", paddingTop: 32, paddingBottom: 16 }}>
      <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, fontSize: 28 }}>
        {icons.map((icon, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: T.mute, fontSize: 15 }}>→</span>}
            <span
              className="ns-loading-icon"
              style={{
                opacity: stage === i ? 1 : 0.3,
                display: "inline-block",
                animation: stage === i ? "ns-breathe 2.2s ease-in-out infinite" : "none",
              }}
            >
              {icon}
            </span>
          </React.Fragment>
        ))}
      </div>
      <div
        role="status"
        aria-live="polite"
        key={messageIndex}
        className="ns-loading-msg"
        style={{ marginTop: 24, color: T.mute, fontSize: 14, animation: "ns-fade 400ms ease" }}
      >
        {t(LOADING_MESSAGE_KEYS[messageIndex % LOADING_MESSAGE_KEYS.length])}
      </div>
    </div>
  );
}

function TooBigScreen({ issue, onEditOrder, t }) {
  const body = issue === "input_too_long"
    ? t("estimate.inputTooLongBody")
    : t("estimate.orderTooBigBody", { max: MAX_ITEMS });
  return (
    <div>
      <div style={{ ...card(), textAlign: "center" }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>🧺</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{t("estimate.orderTooBigTitle")}</div>
        <div style={{ color: T.mute, fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{body}</div>
        <div style={{ height: 18 }} />
        <button style={btn(T.jade, T.bg)} onClick={onEditOrder}>{t("order.editOrder")}</button>
      </div>
    </div>
  );
}

function InterceptScreen({ amount, food, saved, goal, pct, streak, onDone, t }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStep(1), 450);
    const b = setTimeout(() => setStep(2), 1300);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  return (
    <div style={{ textAlign: "center", paddingTop: 8 }}>
      <div style={{ position: "relative", height: 180, display: "flex", alignItems: "center", justifyContent: "center", margin: "10px 0 6px" }}>
        <div style={{ position: "absolute", width: 150, height: 150, borderRadius: "50%", background: "radial-gradient(circle, rgba(95,214,166,.20), transparent 70%)", animation: "ns-breathe 3s ease-in-out infinite" }} />
        <div style={{ width: 90, height: 90, borderRadius: "50%", border: `2px solid ${T.jade}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, opacity: step >= 1 ? 1 : 0, transform: step >= 1 ? "scale(1)" : "scale(.6)", transition: "all .6s cubic-bezier(.2,.8,.2,1)" }}>🌙</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, opacity: step >= 1 ? 1 : 0, transition: "opacity .5s .1s" }}>{t("intercept.title")}</div>
      <div style={{ color: T.mute, fontSize: 15, marginTop: 8, opacity: step >= 1 ? 1 : 0, transition: "opacity .5s .2s", lineHeight: 1.5 }}>
        {t("intercept.notCome", { food: food || "" })}
      </div>

      {/* the amount kept — gentle fade + slight upward motion */}
      <div style={{ marginTop: 20, opacity: step >= 1 ? 1 : 0, animation: step >= 1 ? "ns-rise .5s ease" : "none" }}>
        <div style={{ fontSize: 13, color: T.mute }}>{t("intercept.saved")}</div>
        <div style={{ fontSize: 40, fontWeight: 800, color: T.jade, marginTop: 4 }}>{money(amount)}</div>
      </div>

      {goal && (
        <div style={{ ...card(), marginTop: 22, textAlign: "left", opacity: step >= 2 ? 1 : 0, transform: step >= 2 ? "translateY(0)" : "translateY(10px)", transition: "all .5s cubic-bezier(.2,.8,.2,1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: T.mute, marginBottom: 8 }}>
            <span>{goal.name}</span><span>{Math.round(pct)}%</span>
          </div>
          <div style={{ height: 10, background: "#0c1120", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,#3fae83,${T.jade})`, borderRadius: 99, transition: "width .9s .2s cubic-bezier(.2,.8,.2,1)" }} />
          </div>
          <div style={{ fontSize: 13, color: T.mute, marginTop: 10 }}>🔥 {t("intercept.streakLine", { n: streak, amt: money(saved) })}</div>
        </div>
      )}
      <div style={{ height: 20 }} />
      <button style={btn(T.jade, T.bg)} onClick={onDone}>{t("common.done")}</button>
    </div>
  );
}

function CelebrateScreen({ goalName, savedAmount, targetAmount, streak, onCreateNew, onKeepSaving, t }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 24, animation: "ns-fade 240ms ease" }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{t("celebrate.title")}</div>
      <div style={{ color: T.text, fontSize: 16, marginTop: 10, lineHeight: 1.5 }}>
        {t("celebrate.body", { goal: goalName })}
      </div>
      <div style={{ color: T.mute, fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
        {t("celebrate.streakLine", { n: streak })}
      </div>
      <div style={{ ...card(), marginTop: 22, animation: "ns-rise .5s ease" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.jade }}>
          {t("celebrate.savedToward", { saved: money(savedAmount), target: money(targetAmount) })}
        </div>
      </div>
      <div style={{ height: 20 }} />
      <button style={btn(T.jade, T.bg)} onClick={onCreateNew}>{t("celebrate.createGoal")}</button>
      <div style={{ height: 10 }} />
      <button style={btn("transparent", T.text)} onClick={onKeepSaving}>{t("celebrate.keepSaving")}</button>
    </div>
  );
}

function AteScreen({ onDone, t }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 24, animation: "ns-fade 240ms ease" }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>🍽️</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{t("ate.title")}</div>
      <div style={{ color: T.mute, fontSize: 15, marginTop: 10, lineHeight: 1.5 }}>{t("ate.subtitle")}</div>
      <div style={{ height: 24 }} />
      <button style={btn(T.jade, T.bg)} onClick={onDone}>{t("common.done")}</button>
    </div>
  );
}
