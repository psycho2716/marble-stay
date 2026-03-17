import { Router } from "express";
import { createSupabaseClientForUser } from "../config/supabaseClient";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/preferences", authenticate, async (req, res) => {
  if (!req.supabaseAccessToken) {
    res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
    return;
  }
  const db = createSupabaseClientForUser(req.supabaseAccessToken);

  const { data, error } = await db
    .from("user_preferences")
    .select("*")
    .eq("user_id", req.user!.sub)
    .single();

  if (error && error.code !== "PGRST116") {
    res.status(500).json({ error: "Failed to load preferences" });
    return;
  }

  res.json(data ?? { budget_min: null, budget_max: null, amenities: [] });
});

router.patch("/preferences", authenticate, async (req, res) => {
  if (!req.supabaseAccessToken) {
    res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
    return;
  }
  const db = createSupabaseClientForUser(req.supabaseAccessToken);
  const { budget_min, budget_max, amenities } = req.body;

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (budget_min !== undefined) payload.budget_min = budget_min == null ? null : Number(budget_min);
  if (budget_max !== undefined) payload.budget_max = budget_max == null ? null : Number(budget_max);
  if (amenities !== undefined) payload.amenities = Array.isArray(amenities) ? amenities : [];

  const { data, error } = await db
    .from("user_preferences")
    .upsert({ user_id: req.user!.sub, ...payload }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message ?? "Failed to save preferences" });
    return;
  }

  res.json(data);
});

export default router;
