"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useI18n } from "../lib/i18n";
import { useRepo } from "../lib/useRepo";
import { T, card, label } from "../lib/ui/theme";

const money = (n) => "$" + Number(n || 0).toFixed(2);

// Local (not UTC) calendar-day key — "Today"/"Yesterday" must match the
// viewer's own clock, not the server's or the stored UTC instant.
function localDayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// rows are already newest-first (repo.listDecisions); group same-local-day
// entries together without touching that order, inside or across groups.
function groupByLocalDate(rows) {
  const groups = [];
  let current = null;
  for (const row of rows) {
    const dt = row.created_at ? new Date(row.created_at) : null;
    const valid = dt instanceof Date && !isNaN(dt.getTime());
    const key = valid ? localDayKey(dt) : "invalid";
    if (!current || current.key !== key) {
      current = { key, date: valid ? dt : null, items: [] };
      groups.push(current);
    }
    current.items.push(row);
  }
  return groups;
}

function groupHeading(date, t, locale) {
  if (!date) return t("history.unknownDate");
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const sameYear = date.getFullYear() === now.getFullYear();
    const formatted = new Intl.DateTimeFormat(
      locale,
      sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }
    ).format(date);
    if (localDayKey(date) === localDayKey(now)) return `${t("history.today")} · ${formatted}`;
    if (localDayKey(date) === localDayKey(yesterday)) return `${t("history.yesterday")} · ${formatted}`;
    return formatted;
  } catch {
    return t("history.unknownDate");
  }
}

export default function History() {
  const { t, locale } = useI18n();
  const repo = useRepo();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ week: 0, month: 0, life: 0 });

  const load = useCallback(async () => {
    try {
      const now = Date.now();
      const weekIso = new Date(now - 7 * 864e5).toISOString();
      const monthIso = new Date(now - 30 * 864e5).toISOString();
      const [list, week, month, life] = await Promise.all([
        repo.listDecisions().catch(() => []),
        repo.savedSince(weekIso).catch(() => 0),
        repo.savedSince(monthIso).catch(() => 0),
        repo.savedSince(null).catch(() => 0),
      ]);
      setRows(list);
      setStats({ week, month, life });
    } catch {}
    setReady(true);
  }, [repo]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => groupByLocalDate(rows), [rows]);

  async function voidRow(id) {
    if (!confirm(t("history.voidConfirm"))) return;
    try { await repo.voidDecision(id); } catch {}
    await load();
  }

  if (!ready) return <div style={{ minHeight: "40vh" }} />;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{t("history.title")}</div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <Stat label={t("stats.weekly")} value={money(stats.week)} />
        <Stat label={t("stats.monthly")} value={money(stats.month)} />
        <Stat label={t("stats.lifetime")} value={money(stats.life)} />
      </div>

      {rows.length === 0 ? (
        <div style={{ ...card(), textAlign: "center", color: T.mute }}>{t("history.empty")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {groups.map((g, gi) => (
            <div key={`${g.key}-${gi}`}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.mute, letterSpacing: 0.4, marginBottom: 10 }}>
                {groupHeading(g.date, t, locale)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {g.items.map((d) => (
                  <div key={d.id} style={{ ...card(), padding: 16, opacity: d.voided_at ? 0.45 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 16, fontWeight: 700, textDecoration: d.voided_at ? "line-through" : "none" }}>{d.food_name}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: d.decision === "saved" ? T.jade : T.mute }}>
                        {money(d.allocated_amount != null ? d.allocated_amount : d.estimate_typical)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <span style={{ fontSize: 13, color: T.mute }}>
                        {d.decision === "saved" ? "💚 " + t("history.saved") : "🍽️ " + t("history.ate")}
                        {d.goal_name_snapshot ? ` · ${d.goal_name_snapshot}` : ""}
                      </span>
                      {d.voided_at ? (
                        <span style={{ fontSize: 12, color: T.mute }}>{t("history.voided")}</span>
                      ) : (
                        <button onClick={() => voidRow(d.id)} style={{ background: "none", border: "none", color: T.mute, fontSize: 12, cursor: "pointer" }}>{t("history.void")}</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label: l, value }) {
  return (
    <div style={{ ...card(), flex: 1, padding: 14, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: T.mute, marginBottom: 6 }}>{l}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.jade }}>{value}</div>
    </div>
  );
}
