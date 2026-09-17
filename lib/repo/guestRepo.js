// Guest repository. Data lives on-device in localStorage but its shape is
// IDENTICAL to the Supabase tables, so migration is a straight copy — no
// transformation. Every record gets a UUID at creation and keeps it forever.

const KEY = "nightsave_guest_v1";

const uuid = () =>
  (crypto?.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    }));

const now = () => new Date().toISOString();

function emptyState() {
  return {
    profile: { nickname: null, avatar_url: null, default_city: null, default_zip: null, app_language: "en" },
    goals: [],
    decisions: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    return { ...emptyState(), ...s, profile: { ...emptyState().profile, ...(s.profile || {}) } };
  } catch {
    return emptyState();
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function createGuestRepo() {
  return {
    isGuest: true,

    // ---- profile ----
    async getProfile() {
      return load().profile;
    },
    async updateProfile(patch) {
      const s = load();
      s.profile = { ...s.profile, ...patch };
      save(s);
      return s.profile;
    },
    async setAppLanguage(lang) {
      // local storage is always ready, no retry needed
      const s = load();
      s.profile = { ...s.profile, app_language: lang };
      save(s);
      return s.profile;
    },

    // ---- goals ----
    async listGoals() {
      return load().goals.filter((g) => g.status !== "archived");
    },
    async getActiveGoal() {
      return load().goals.find((g) => g.is_active) || null;
    },
    async createGoal({ name, target_amount }) {
      const s = load();
      const g = {
        id: uuid(),
        name,
        target_amount: Number(target_amount),
        is_active: s.goals.every((x) => !x.is_active), // first goal becomes active
        status: "active",
        completed_at: null,
        created_at: now(),
        updated_at: now(),
      };
      s.goals.push(g);
      save(s);
      return g;
    },
    async updateGoal(id, patch) {
      const s = load();
      const g = s.goals.find((x) => x.id === id);
      if (!g) throw new Error("goal not found");
      Object.assign(g, patch, { updated_at: now() });
      save(s);
      return g;
    },
    async deleteGoal(id) {
      const s = load();
      s.goals = s.goals.filter((x) => x.id !== id);
      // decisions keep their snapshot; sever the live link only
      s.decisions.forEach((d) => { if (d.goal_id === id) d.goal_id = null; });
      save(s);
    },
    async setActiveGoal(id) {
      const s = load();
      s.goals.forEach((g) => { g.is_active = g.id === id && g.status === "active"; });
      save(s);
    },

    // ---- decisions ----
    async listDecisions() {
      return [...load().decisions].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
    async recordDecision(input) {
      const s = load();
      const d = {
        id: uuid(),
        food_name: input.food_name,
        input_locale: input.input_locale ?? null,
        estimate_typical: Number(input.estimate_typical),
        estimate_low: input.estimate_low ?? null,
        estimate_high: input.estimate_high ?? null,
        city: input.city ?? null,
        zip: input.zip ?? null,
        reply_locale: input.reply_locale ?? null,
        decision: input.decision, // 'saved' | 'ate'
        goal_id: input.decision === "saved" ? input.goal_id ?? null : null,
        goal_name_snapshot: input.decision === "saved" ? input.goal_name_snapshot ?? null : null,
        allocated_amount: input.allocated_amount != null ? Number(input.allocated_amount) : null,
        voided_at: null,
        created_at: now(),
      };
      s.decisions.push(d);
      save(s);
      return d;
    },
    async voidDecision(id) {
      const s = load();
      const d = s.decisions.find((x) => x.id === id);
      if (!d || d.voided_at) throw new Error("decision not found or already voided");
      d.voided_at = now();
      save(s);
    },

    // ---- stats (voided excluded) ----
    async savedForGoal(goalId) {
      return load().decisions
        .filter((d) => d.goal_id === goalId && d.decision === "saved" && !d.voided_at)
        .reduce((sum, d) => sum + Number(d.allocated_amount || 0), 0);
    },
    async savedSince(sinceIso) {
      return load().decisions
        .filter((d) => d.decision === "saved" && !d.voided_at && (!sinceIso || d.created_at >= sinceIso))
        .reduce((sum, d) => sum + Number(d.allocated_amount || 0), 0);
    },

    // ---- migration ----
    exportPayload() {
      const s = load();
      return { profile: {
          city: s.profile.default_city, zip: s.profile.default_zip, language: s.profile.app_language,
        }, goals: s.goals, decisions: s.decisions };
    },
    clear() {
      localStorage.removeItem(KEY);
    },
  };
}
