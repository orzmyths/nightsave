"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useI18n } from "../lib/i18n";
import { useRepo } from "../lib/useRepo";
import { T, card, input, btn, label } from "../lib/ui/theme";

const money = (n) => "$" + Number(n || 0).toFixed(2);

export default function Goals() {
  const { t } = useI18n();
  const repo = useRepo();
  const [ready, setReady] = useState(false);
  const [goals, setGoals] = useState([]);
  const [savedMap, setSavedMap] = useState({});
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await repo.listGoals();
      const entries = await Promise.all(
        list.map(async (g) => [g.id, await repo.savedForGoal(g.id).catch(() => 0)])
      );
      setGoals(list);
      setSavedMap(Object.fromEntries(entries));
    } catch {}
    setReady(true);
  }, [repo]);

  useEffect(() => { load(); }, [load]);

  async function create({ name, target }) {
    try {
      const g = await repo.createGoal({ name, target_amount: target });
      // first goal becomes active automatically; guarantee at least one active
      const active = await repo.getActiveGoal();
      if (g && !active) await repo.setActiveGoal(g.id);
    } catch {}
    setCreating(false);
    await load();
  }
  async function saveEdit(id, { name, target }) {
    try { await repo.updateGoal(id, { name, target_amount: target }); } catch {}
    setEditingId(null);
    await load();
  }
  async function remove(id) {
    if (!confirm(t("goals.deleteConfirm"))) return;
    try { await repo.deleteGoal(id); } catch {}
    await load();
  }
  async function makeActive(id) {
    try { await repo.setActiveGoal(id); } catch {}
    await load();
  }

  if (!ready) return <div style={{ minHeight: "40vh" }} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 20, fontWeight: 800 }}>{t("goals.title")}</span>
        {!creating && (
          <button onClick={() => { setCreating(true); setEditingId(null); }}
            style={{ background: T.jade, color: T.bg, border: "none", borderRadius: 999, padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            + {t("goals.create")}
          </button>
        )}
      </div>

      {creating && (
        <div style={{ marginBottom: 16 }}>
          <GoalForm t={t} onCancel={() => setCreating(false)} onSubmit={create} />
        </div>
      )}

      {goals.length === 0 && !creating ? (
        <div style={{ ...card(), textAlign: "center", color: T.mute }}>{t("goals.empty")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {goals.map((g) =>
            editingId === g.id ? (
              <GoalForm key={g.id} t={t} initial={g}
                onCancel={() => setEditingId(null)}
                onSubmit={(vals) => saveEdit(g.id, vals)} />
            ) : (
              <GoalRow key={g.id} g={g} saved={savedMap[g.id] || 0} t={t}
                onEdit={() => { setEditingId(g.id); setCreating(false); }}
                onDelete={() => remove(g.id)}
                onActivate={() => makeActive(g.id)} />
            )
          )}
        </div>
      )}
    </div>
  );
}

function GoalRow({ g, saved, t, onEdit, onDelete, onActivate }) {
  const pct = Math.min(100, (saved / g.target_amount) * 100);
  return (
    <div style={{ ...card(), border: g.is_active ? `1px solid ${T.jade}` : `1px solid ${T.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{g.name}</span>
        {g.is_active && (
          <span style={{ fontSize: 11, color: T.jade, border: `1px solid ${T.jade}`, borderRadius: 999, padding: "2px 8px" }}>{t("goals.activeBadge")}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: T.jade }}>{money(saved)}</span>
        <span style={{ color: T.mute, fontSize: 14 }}>/ {money(g.target_amount)} · {Math.round(pct)}%</span>
      </div>
      <div style={{ height: 8, background: "#0c1120", borderRadius: 99, marginTop: 10, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,#3fae83,${T.jade})`, borderRadius: 99 }} />
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
        {!g.is_active && (
          <button onClick={onActivate} style={linkBtn(T.jade)}>{t("goals.markActive")}</button>
        )}
        <button onClick={onEdit} style={linkBtn(T.mute)}>{t("common.edit")}</button>
        <button onClick={onDelete} style={linkBtn("#e08a8a")}>{t("goals.delete")}</button>
      </div>
    </div>
  );
}

function GoalForm({ t, initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [target, setTarget] = useState(initial?.target_amount != null ? String(initial.target_amount) : "");
  const [err, setErr] = useState("");

  function submit() {
    const n = Number(target);
    if (target.trim() === "" || !Number.isFinite(n) || n <= 0) { setErr(t("goals.invalidAmount")); return; }
    onSubmit({ name: (name || "").trim() || t("goals.title"), target: n });
  }

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
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button style={{ ...btn(T.jade, T.bg), flex: 1 }} onClick={submit}>{t("common.save")}</button>
        <button style={{ ...btn("transparent", T.text), flex: 1 }} onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}

const linkBtn = (color) => ({ background: "none", border: "none", color, fontSize: 13, cursor: "pointer", padding: 0 });
