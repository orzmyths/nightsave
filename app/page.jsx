"use client";
import React, { useState, useEffect } from "react";

// ── palette ──────────────────────────────────────────────
const BG = "#0E1322";
const SURFACE = "#191F33";
const SURFACE_2 = "#212a43";
const LINE = "#2b3450";
const TEXT = "#E9ECF6";
const MUTE = "#8891A9";
const JADE = "#5FD6A6";
const AMBER = "#E0A45B";

const money = (n) => "$" + Number(n).toFixed(2);
const STORE_KEY = "nightsave_v1";

export default function NightSave() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState("search"); // search | order | intercept
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState(null);

  const [goal, setGoal] = useState({ name: "沖繩四天三夜", target: 800 });
  const [saved, setSaved] = useState(0);
  const [streak, setStreak] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);

  // load once
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (s) {
        if (s.goal) setGoal(s.goal);
        if (typeof s.saved === "number") setSaved(s.saved);
        if (typeof s.streak === "number") setStreak(s.streak);
        if (s.area) setArea(s.area);
      }
    } catch {}
    setReady(true);
  }, []);

  // persist
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ goal, saved, streak, area }));
    } catch {}
  }, [ready, goal, saved, streak, area]);

  const pct = Math.min(100, (saved / goal.target) * 100);

  async function estimate() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, area: area.trim() }),
      });
      const p = await res.json();
      setItem({
        name: p.name || q,
        low: Math.round(p.low),
        high: Math.round(p.high),
        typical: Math.round(p.typical),
        note: p.note || "",
      });
      setScreen("order");
    } catch {
      const t = 15;
      setItem({ name: q, low: t - 3, high: t + 5, typical: t, note: "連不上估價 先給你一個大概" });
      setScreen("order");
    } finally {
      setLoading(false);
    }
  }

  function placeOrder() {
    setSaved((s) => s + item.typical);
    setStreak((s) => s + 1);
    setScreen("intercept");
  }

  function reset() {
    setQuery("");
    setItem(null);
    setScreen("search");
  }

  if (!ready) return <div style={{ minHeight: "100vh", background: BG }} />;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT }}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 18px 40px" }}>
        <GoalCard
          goal={goal} saved={saved} pct={pct} streak={streak}
          editing={editingGoal} setEditing={setEditingGoal}
          onSave={(g) => { setGoal(g); setEditingGoal(false); }}
        />
        <div style={{ height: 22 }} />

        {screen === "search" && (
          <SearchScreen
            query={query} setQuery={setQuery} area={area} setArea={setArea}
            loading={loading} onGo={estimate}
          />
        )}
        {screen === "order" && item && <OrderScreen item={item} onOrder={placeOrder} onBack={reset} />}
        {screen === "intercept" && item && (
          <InterceptScreen item={item} saved={saved} goal={goal} pct={pct} streak={streak} onDone={reset} />
        )}
      </div>
    </div>
  );
}

function GoalCard({ goal, saved, pct, streak, editing, setEditing, onSave }) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(goal.target);
  useEffect(() => { setName(goal.name); setTarget(goal.target); }, [goal]);

  if (editing) {
    return (
      <div style={card()}>
        <Label>目標名稱</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={input()} />
        <div style={{ height: 12 }} />
        <Label>目標金額</Label>
        <input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} style={input()} />
        <div style={{ height: 16 }} />
        <button style={btn(JADE, BG)} onClick={() => onSave({ name: name.trim() || "我的目標", target: Math.max(1, target) })}>
          存起來
        </button>
      </div>
    );
  }

  return (
    <div style={card()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, letterSpacing: 2, color: MUTE }}>正在存錢去</span>
        <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: MUTE, fontSize: 13, cursor: "pointer" }}>編輯</button>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{goal.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 16 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: JADE }}>{money(saved)}</span>
        <span style={{ color: MUTE, fontSize: 15 }}>/ {money(goal.target)}</span>
      </div>
      <div style={{ height: 10, background: "#0c1120", borderRadius: 99, marginTop: 12, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,#3fae83,${JADE})`, borderRadius: 99, transition: "width .7s cubic-bezier(.2,.8,.2,1)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13, color: MUTE }}>
        <span>還差 {money(Math.max(0, goal.target - saved))}</span>
        <span>🔥 忍住 {streak} 次</span>
      </div>
    </div>
  );
}

function SearchScreen({ query, setQuery, area, setArea, loading, onGo }) {
  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>半夜想吃點什麼 🌙</div>
      <div style={{ color: MUTE, fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
        搜你現在想叫的那一份 看看它值多少 然後我們一起決定
      </div>
      <div style={card()}>
        <Label>想吃的東西</Label>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onGo()}
          placeholder="鹽酥雞 珍奶 炸雞 拉麵..." style={input()} />
        <div style={{ height: 12 }} />
        <Label>你的區域（選填）</Label>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="San Jose" style={input()} />
        <div style={{ height: 18 }} />
        <button style={btn(AMBER, "#241704", loading)} disabled={loading} onClick={onGo}>
          {loading ? "估價中…" : "看看這份多少錢"}
        </button>
      </div>
      <div style={{ textAlign: "center", color: MUTE, fontSize: 12, marginTop: 18, lineHeight: 1.6 }}>
        我們不真的送餐 也不碰你的錢<br />只幫你把想花的 留給更想要的
      </div>
    </div>
  );
}

function OrderScreen({ item, onOrder, onBack }) {
  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: MUTE, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>← 換一個</button>
      <div style={card()}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{item.name}</div>
        {item.note ? <div style={{ color: MUTE, fontSize: 14, marginTop: 6 }}>{item.note}</div> : null}
        <div style={{ borderTop: `1px solid ${LINE}`, margin: "18px 0", paddingTop: 16 }}>
          <Row k="附近大概落在" v={`${money(item.low)} – ${money(item.high)}`} />
          <div style={{ height: 10 }} />
          <Row k="這份預估" v={money(item.typical)} big />
        </div>
      </div>
      <div style={{ height: 16 }} />
      <button style={btn(AMBER, "#241704")} onClick={onOrder}>下單 · {money(item.typical)}</button>
      <div style={{ textAlign: "center", color: MUTE, fontSize: 12, marginTop: 12 }}>按下去看看會發生什麼 😉</div>
    </div>
  );
}

function InterceptScreen({ item, saved, goal, pct, streak, onDone }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 500);
    const t2 = setTimeout(() => setStep(2), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div style={{ textAlign: "center", paddingTop: 8 }}>
      <div style={{ position: "relative", height: 180, display: "flex", alignItems: "center", justifyContent: "center", margin: "10px 0 6px" }}>
        <div style={{ position: "absolute", width: 150, height: 150, borderRadius: "50%", background: "radial-gradient(circle, rgba(95,214,166,.20), transparent 70%)", animation: "ns-breathe 3s ease-in-out infinite" }} />
        <div style={{ width: 90, height: 90, borderRadius: "50%", border: `2px solid ${JADE}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, opacity: step >= 1 ? 1 : 0, transform: step >= 1 ? "scale(1)" : "scale(.6)", transition: "all .6s cubic-bezier(.2,.8,.2,1)" }}>🌙</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, opacity: step >= 1 ? 1 : 0, transition: "opacity .5s .1s" }}>你替明天的自己做了選擇</div>
      <div style={{ color: MUTE, fontSize: 15, marginTop: 8, opacity: step >= 1 ? 1 : 0, transition: "opacity .5s .2s", lineHeight: 1.5 }}>
        那份{item.name}沒有送來 但你想花的錢還在
      </div>
      <div style={{ ...card(), marginTop: 22, textAlign: "left", opacity: step >= 2 ? 1 : 0, transform: step >= 2 ? "translateY(0)" : "translateY(10px)", transition: "all .5s cubic-bezier(.2,.8,.2,1)" }}>
        <Row k="這次留下" v={money(item.typical)} big />
        <div style={{ borderTop: `1px solid ${LINE}`, margin: "14px 0", paddingTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: MUTE, marginBottom: 8 }}>
            <span>{goal.name}</span><span>{Math.round(pct)}%</span>
          </div>
          <div style={{ height: 10, background: "#0c1120", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,#3fae83,${JADE})`, borderRadius: 99, transition: "width .8s .2s cubic-bezier(.2,.8,.2,1)" }} />
          </div>
          <div style={{ fontSize: 13, color: MUTE, marginTop: 10 }}>🔥 連續忍住 {streak} 次 · 累積 {money(saved)}</div>
        </div>
      </div>
      <div style={{ height: 20 }} />
      <button style={btn(JADE, BG)} onClick={onDone}>完成</button>
      <style>{`@keyframes ns-breathe{0%,100%{transform:scale(.9);opacity:.5}50%{transform:scale(1.15);opacity:1}}`}</style>
    </div>
  );
}

function Row({ k, v, big }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ color: MUTE, fontSize: big ? 15 : 14 }}>{k}</span>
      <span style={{ fontWeight: big ? 800 : 600, fontSize: big ? 26 : 15, color: big ? JADE : TEXT }}>{v}</span>
    </div>
  );
}
function Label({ children }) { return <div style={{ fontSize: 12, color: MUTE, marginBottom: 7, letterSpacing: 0.5 }}>{children}</div>; }
function card() { return { background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 18, padding: 20 }; }
function input() { return { width: "100%", boxSizing: "border-box", background: SURFACE_2, border: `1px solid ${LINE}`, borderRadius: 12, padding: "13px 14px", color: TEXT, fontSize: 16, outline: "none" }; }
function btn(bg, fg, disabled) { return { width: "100%", background: bg, color: fg, border: "none", borderRadius: 13, padding: "15px", fontSize: 16, fontWeight: 700, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }; }
