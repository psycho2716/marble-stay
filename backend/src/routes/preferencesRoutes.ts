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
  if (budget_min !== undefined) payload.budget_min = budget_min == null ? null : Number(budget_min);
  if (budget_max !== undefined) payload.budget_max = budget_max == null ? null : Number(budget_max);
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
