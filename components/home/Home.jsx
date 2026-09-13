"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../lib/i18n";
import { useRepo } from "../../lib/useRepo";
import { T, card, input, btn, label } from "../../lib/ui/theme";

const money = (n) => "$" + Number(n || 0).toFixed(2);

// The real NightSave experience from v0.1, now backed by the repo layer.
// Guest → guestRepo (local), signed-in → cloudRepo (Supabase). Home never
// has to know which; useRepo() decides.
export default function Home() {
  const { t, locale } = useI18n();
  const repo = useRepo();

  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState("search"); // search | order | intercept | ate
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState(null);

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

  useEffect(() => { loadData(); }, [loadData]);

  const pct = activeGoal ? Math.min(100, (saved / activeGoal.target_amount) * 100) : 0;

  async function estimate() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, area: area.trim(), zip: zip.trim(), reply_locale: locale }),
      });
      const p = await res.json();
      setItem({ name: p.name || q, low: Math.round(p.low), high: Math.round(p.high), typical: Math.round(p.typical), note: p.note || "" });
      setScreen("order");
    } catch {
      const t0 = 15;
      setItem({ name: q, low: t0 - 3, high: t0 + 5, typical: t0, note: "" });
      setScreen("order");
    } finally {
      setLoading(false);
    }
  }

  async function decide(kind) {
    // kind: "saved" | "ate"
    const base = {
      food_name: item.name,
      input_locale: null,
      estimate_typical: item.typical,
      estimate_low: item.low,
      estimate_high: item.high,
      city: area.trim() || null,
      zip: zip.trim() || null,
      reply_locale: locale,
      decision: kind,
    };
    const payload =
      kind === "saved"
        ? { ...base, goal_id: activeGoal?.id || null, goal_name_snapshot: activeGoal?.name || null, allocated_amount: item.typical }
        : base;
    try { await repo.recordDecision(payload); } catch {}
    await loadData();
    setScreen(kind === "saved" ? "intercept" : "ate");
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

  function reset() { setQuery(""); setItem(null); setScreen("search"); }

  if (!ready) return <div style={{ minHeight: "60vh" }} />;

  return (
    <div>
      {activeGoal || editingGoal ? (
        <GoalCard goal={activeGoal} saved={saved} pct={pct} streak={streak}
          editing={editingGoal} setEditing={setEditingGoal} onSave={saveGoal} t={t} />
      ) : (
        <EmptyGoal onCreate={() => setEditingGoal(true)} t={t} />
      )}

      <div style={{ height: 22 }} />

      {screen === "search" && (
        <SearchScreen query={query} setQuery={setQuery} area={area} setArea={setArea}
          zip={zip} setZip={setZip} loading={loading} onGo={estimate} t={t} />
      )}
      {screen === "order" && item && (
        <OrderScreen item={item} hasGoal={!!activeGoal}
          onSave={() => decide("saved")} onAte={() => decide("ate")} onBack={reset} t={t} />
      )}
      {screen === "intercept" && item && (
        <InterceptScreen item={item} saved={saved} goal={activeGoal} pct={pct} streak={streak} onDone={reset} t={t} />
      )}
      {screen === "ate" && item && <AteScreen onDone={reset} t={t} />}
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
    // reject empty / non-numeric / zero / negative — only valid positive amounts
    if (target.trim() === "" || !Number.isFinite(n) || n <= 0) {
      setErr(t("goals.invalidAmount"));
      return;
    }
    onSave({ name: (name || "").trim() || t("goals.title"), target: n });
  }

  if (editing) {
    return (
      <div style={card()}>
        <div style={label()}>{t("goals.name")}</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("goals.namePlaceholder")} style={input()} />
        <div style={{ height: 12 }} />
        <div style={label()}>{t("goals.target")}</div>
        {/* keep as string so clearing the field stays empty, not forced to 0 */}
        <input
          type="text"
          inputMode="numeric"
          value={target}
          onChange={(e) => {
            const v = e.target.value;
            // allow empty, or digits with an optional single decimal point
            if (v === "" || /^\d*\.?\d*$/.test(v)) { setTarget(v); setErr(""); }
          }}
          placeholder="800"
          style={input()}
        />
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
        <span>{t("home.remaining", { amt: money(Math.max(0, goal.target_amount - saved)) })}</span>
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

function OrderScreen({ item, hasGoal, onSave, onAte, onBack, t }) {
  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: T.mute, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>← {t("order.change")}</button>
      <div style={card()}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{item.name}</div>
        {item.note ? <div style={{ color: T.mute, fontSize: 14, marginTop: 6 }}>{item.note}</div> : null}
        <div style={{ borderTop: `1px solid ${T.line}`, margin: "18px 0", paddingTop: 16 }}>
          <Row k={t("order.range")} v={`${money(item.low)} – ${money(item.high)}`} />
          <div style={{ height: 10 }} />
          <Row k={t("order.thisOrder")} v={money(item.typical)} big />
        </div>
      </div>
      <div style={{ height: 16 }} />
      <button style={btn(T.jade, T.bg)} onClick={onSave}>{t("order.save")} · {money(item.typical)}</button>
      <div style={{ height: 10 }} />
      <button style={btn("transparent", T.text)} onClick={onAte}>{t("order.eat")}</button>
      {!hasGoal && (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 12, marginTop: 12 }}>{t("home.setGoalTitle")}</div>
      )}
    </div>
  );
}

function InterceptScreen({ item, saved, goal, pct, streak, onDone, t }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStep(1), 500);
    const b = setTimeout(() => setStep(2), 1400);
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
        {t("intercept.notCome", { food: item.name })}
      </div>
      <div style={{ ...card(), marginTop: 22, textAlign: "left", opacity: step >= 2 ? 1 : 0, transform: step >= 2 ? "translateY(0)" : "translateY(10px)", transition: "all .5s cubic-bezier(.2,.8,.2,1)" }}>
        <Row k={t("intercept.saved")} v={money(item.typical)} big />
        {goal && (
          <div style={{ borderTop: `1px solid ${T.line}`, margin: "14px 0", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: T.mute, marginBottom: 8 }}>
              <span>{goal.name}</span><span>{Math.round(pct)}%</span>
            </div>
            <div style={{ height: 10, background: "#0c1120", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,#3fae83,${T.jade})`, borderRadius: 99, transition: "width .8s .2s cubic-bezier(.2,.8,.2,1)" }} />
            </div>
            <div style={{ fontSize: 13, color: T.mute, marginTop: 10 }}>🔥 {t("intercept.streakLine", { n: streak, amt: money(saved) })}</div>
          </div>
        )}
      </div>
      <div style={{ height: 20 }} />
      <button style={btn(T.jade, T.bg)} onClick={onDone}>{t("common.done")}</button>
      <style>{`@keyframes ns-breathe{0%,100%{transform:scale(.9);opacity:.5}50%{transform:scale(1.15);opacity:1}}`}</style>
    </div>
  );
}

function AteScreen({ onDone, t }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 24 }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>🍽️</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{t("ate.title")}</div>
      <div style={{ color: T.mute, fontSize: 15, marginTop: 10, lineHeight: 1.5 }}>{t("ate.subtitle")}</div>
      <div style={{ height: 24 }} />
      <button style={btn(T.jade, T.bg)} onClick={onDone}>{t("common.done")}</button>
    </div>
  );
}

function Row({ k, v, big }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ color: T.mute, fontSize: big ? 15 : 14 }}>{k}</span>
      <span style={{ fontWeight: big ? 800 : 600, fontSize: big ? 26 : 15, color: big ? T.jade : T.text }}>{v}</span>
    </div>
  );
}
