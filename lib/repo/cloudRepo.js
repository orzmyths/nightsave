// Cloud repository. Same method surface as the guest repo, backed by Supabase.
// RLS guarantees every row read/written belongs to the current user; we still
// pass user_id on insert so the WITH CHECK policy is satisfied.

export function createCloudRepo(supabase, userId) {
  const uid = userId;

  return {
    isGuest: false,

    // ---- profile ----
    async getProfile() {
      const { data, error } = await supabase
        .from("profiles").select("*").eq("id", uid).single();
      if (error) throw error;
      return data;
    },
    async updateProfile(patch) {
      const { data, error } = await supabase
        .from("profiles").update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", uid).select().single();
      if (error) throw error;
      return data;
    },

    // ---- goals ----
    async listGoals() {
      const { data, error } = await supabase
        .from("goals").select("*").neq("status", "archived")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    async getActiveGoal() {
      const { data, error } = await supabase
        .from("goals").select("*").eq("is_active", true).maybeSingle();
      if (error) throw error;
      return data;
    },
    async createGoal({ name, target_amount }) {
      // first goal should become active; check if the user has none active yet
      const active = await this.getActiveGoal();
      const { data, error } = await supabase
        .from("goals")
        .insert({ id: crypto.randomUUID(), user_id: uid, name, target_amount, is_active: !active })
        .select().single();
      if (error) throw error;
      return data;
    },
    async updateGoal(id, patch) {
      const { data, error } = await supabase
        .from("goals").update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    async deleteGoal(id) {
      // decisions.goal_id auto-nulls via ON DELETE SET NULL; snapshot stays
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    async setActiveGoal(id) {
      const { error } = await supabase.rpc("set_active_goal", { p_goal_id: id });
      if (error) throw error;
    },

    // ---- decisions ----
    async listDecisions() {
      const { data, error } = await supabase
        .from("decisions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async recordDecision(input) {
      const row = {
        id: crypto.randomUUID(),
        user_id: uid,
        food_name: input.food_name,
        input_locale: input.input_locale ?? null,
        estimate_typical: input.estimate_typical,
        estimate_low: input.estimate_low ?? null,
        estimate_high: input.estimate_high ?? null,
        city: input.city ?? null,
        zip: input.zip ?? null,
        reply_locale: input.reply_locale ?? null,
        decision: input.decision,
        goal_id: input.decision === "saved" ? input.goal_id ?? null : null,
        goal_name_snapshot: input.decision === "saved" ? input.goal_name_snapshot ?? null : null,
        allocated_amount: input.decision === "saved" ? input.allocated_amount : null,
      };
      const { data, error } = await supabase.from("decisions").insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async voidDecision(id) {
      const { error } = await supabase.rpc("void_decision", { p_decision_id: id });
      if (error) throw error;
    },

    // ---- stats (voided excluded) ----
    async savedForGoal(goalId) {
      const { data, error } = await supabase
        .from("decisions").select("allocated_amount")
        .eq("goal_id", goalId).eq("decision", "saved").is("voided_at", null);
      if (error) throw error;
      return data.reduce((s, d) => s + Number(d.allocated_amount || 0), 0);
    },
    async savedSince(sinceIso) {
      let q = supabase.from("decisions").select("allocated_amount")
        .eq("decision", "saved").is("voided_at", null);
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { data, error } = await q;
      if (error) throw error;
      return data.reduce((s, d) => s + Number(d.allocated_amount || 0), 0);
    },
  };
}
