import { Router } from "express";
import { supabaseAdmin, createSupabaseClientForUser } from "../config/supabaseClient";
import { authenticate } from "../middleware/auth";

const router = Router();

const emptyPrefs = {
  budget_min: null,
  budget_max: null,
  amenities: [] as string[],
  travel_needs: null as string | null,
  hotel_preferences: null as string | null,
};

router.get("/preferences", authenticate, async (req, res) => {
  const db = req.supabaseAccessToken
    ? createSupabaseClientForUser(req.supabaseAccessToken)
    : supabaseAdmin;

  const { data, error } = await db
    .from("user_preferences")
    .select("*")
    .eq("user_id", req.user!.sub)
    .single();

  if (error && error.code !== "PGRST116") {
    res.status(500).json({ error: "Failed to load preferences" });
    return;
  }

  res.json(data ?? emptyPrefs);
});

router.patch("/preferences", authenticate, async (req, res) => {
  const db = req.supabaseAccessToken
    ? createSupabaseClientForUser(req.supabaseAccessToken)
    : supabaseAdmin;

  const { budget_min, budget_max, amenities, travel_needs, hotel_preferences } = req.body;

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let minN: number | null | undefined;
  let maxN: number | null | undefined;
  if (budget_min !== undefined) {
    minN = budget_min == null || budget_min === "" ? null : Number(budget_min);
    if (minN !== null && Number.isNaN(minN)) {
      res.status(400).json({ error: "Invalid min budget" });
      return;
    }
    payload.budget_min = minN;
  }
  if (budget_max !== undefined) {
    maxN = budget_max == null || budget_max === "" ? null : Number(budget_max);
    if (maxN !== null && Number.isNaN(maxN)) {
      res.status(400).json({ error: "Invalid max budget" });
      return;
    }
    payload.budget_max = maxN;
  }
  if (
    minN != null &&
    maxN != null &&
    !Number.isNaN(minN) &&
    !Number.isNaN(maxN) &&
    minN > maxN
  ) {
    res.status(400).json({ error: "Min budget cannot be greater than max budget" });
    return;
  }
  if (amenities !== undefined) payload.amenities = Array.isArray(amenities) ? amenities : [];
  if (travel_needs !== undefined) payload.travel_needs = travel_needs == null || travel_needs === "" ? null : String(travel_needs).trim();
  if (hotel_preferences !== undefined) payload.hotel_preferences = hotel_preferences == null || hotel_preferences === "" ? null : String(hotel_preferences).trim();

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
