import { Router } from "express";
import type { Request } from "express";
import { supabaseClient, createSupabaseClientForUser } from "../config/supabaseClient";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get(
  "/recommendations",
  authenticate,
  async (req: Request, res): Promise<void> => {
    if (!req.supabaseAccessToken) {
      res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
      return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);

    const { data: prefs, error: prefsError } = await db
      .from("user_preferences")
      .select("*")
      .eq("user_id", req.user!.sub)
      .single();

    if (prefsError && prefsError.code !== "PGRST116") {
      res.status(500).json({ error: "Failed to load preferences" });
      return;
    }

    const { data: hotels, error: hotelsError } = await supabaseClient
      .from("hotels")
      .select("id, name, address, images")
      .eq("verification_status", "verified");

    if (hotelsError) {
      res.status(500).json({ error: "Failed to load hotels" });
      return;
    }

    // Simple rule-based ordering: if budget is set, prefer hotels with rooms in range.
    let recommended = hotels ?? [];

    if (prefs?.budget_min != null || prefs?.budget_max != null) {
      const { data: pricedRooms } = await supabaseClient
        .from("rooms")
        .select("hotel_id, base_price_night");

      const byHotel: Record<
        string,
        { minPrice: number; hotelId: string }
      > = {};

      (pricedRooms ?? []).forEach((r) => {
        const price = Number(r.base_price_night);
        const entry = byHotel[r.hotel_id];
        if (!entry || price < entry.minPrice) {
          byHotel[r.hotel_id] = { hotelId: r.hotel_id, minPrice: price };
        }
      });

      recommended = recommended
        .map((h) => {
          const info = byHotel[h.id];
          return { ...h, minPrice: info?.minPrice ?? Number.MAX_SAFE_INTEGER };
        })
        .sort((a, b) => a.minPrice - b.minPrice);
    }

    res.json(recommended);
  }
);

export default router;

