import { Router } from "express";
import type { Request } from "express";
import {
  supabaseClient,
  supabaseAdmin,
  createSupabaseClientForUser
} from "../config/supabaseClient";
import { authenticate } from "../middleware/auth";

const router = Router();

/** Fetch review aggregates (average_rating, review_count) by hotel_id from reviews -> bookings -> rooms. */
async function getReviewAggregatesByHotel(): Promise<Map<string, { average_rating: number; review_count: number }>> {
  const { data: reviewsData, error } = await supabaseClient
    .from("reviews")
    .select("rating, bookings(room_id, rooms(hotel_id))");

  if (error) return new Map();

  const byHotel = new Map<string, number[]>();
  const rows = (reviewsData ?? []) as Array<{
    rating: number;
    bookings?: { room_id?: string; rooms?: { hotel_id?: string } } | null;
  }>;

  for (const r of rows) {
    const hotelId = r.bookings?.rooms?.hotel_id;
    if (!hotelId) continue;
    const arr = byHotel.get(hotelId) ?? [];
    arr.push(r.rating);
    byHotel.set(hotelId, arr);
  }

  const result = new Map<string, { average_rating: number; review_count: number }>();
  for (const [hotelId, ratings] of byHotel) {
    const sum = ratings.reduce((a, b) => a + b, 0);
    result.set(hotelId, {
      average_rating: sum / ratings.length,
      review_count: ratings.length
    });
  }
  return result;
}

router.get(
  "/recommendations",
  authenticate,
  async (req: Request, res): Promise<void> => {
    const userId = req.user!.sub;

    // Prefs: use admin when no Supabase token so recommendations still work
    let prefs: { budget_min?: number | null; budget_max?: number | null } | null = null;
    if (req.supabaseAccessToken) {
      const db = createSupabaseClientForUser(req.supabaseAccessToken);
      const { data, error } = await db
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (!error && data) prefs = data as { budget_min?: number | null; budget_max?: number | null };
    } else {
      const { data } = await supabaseAdmin
        .from("user_preferences")
        .select("budget_min, budget_max")
        .eq("user_id", userId)
        .single();
      if (data) prefs = data as { budget_min?: number | null; budget_max?: number | null };
    }

    const { data: hotels, error: hotelsError } = await supabaseClient
      .from("hotels")
      .select("id, name, address, images, profile_image")
      .eq("verification_status", "verified");

    if (hotelsError) {
      res.status(500).json({ error: "Failed to load hotels" });
      return;
    }

    const aggregates = await getReviewAggregatesByHotel();

    type HotelRow = { id: string; name: string; address: string | null; images: string[] | null; profile_image: string | null };
    let list: Array<HotelRow & { average_rating: number; review_count: number; profile_image_url?: string | null }> = (
      hotels ?? []
    ).map((h) => {
      const row = h as HotelRow;
      const agg = aggregates.get(row.id);
      return {
        ...row,
        address: row.address ?? null,
        images: row.images ?? null,
        profile_image: row.profile_image ?? null,
        average_rating: agg?.average_rating ?? 0,
        review_count: agg?.review_count ?? 0
      };
    });

    // When preferences are set (e.g. budget), filter/sort by them; otherwise show all (default)
    const hasPrefs = prefs && (prefs.budget_min != null || prefs.budget_max != null);
    if (hasPrefs && (prefs!.budget_min != null || prefs!.budget_max != null)) {
      const { data: pricedRooms } = await supabaseClient
        .from("rooms")
        .select("hotel_id, base_price_night");

      const byHotel: Record<string, number> = {};
      (pricedRooms ?? []).forEach((r: { hotel_id: string; base_price_night: number }) => {
        const price = Number(r.base_price_night);
        const cur = byHotel[r.hotel_id];
        if (cur == null || price < cur) byHotel[r.hotel_id] = price;
      });

      const minB = prefs!.budget_min != null ? Number(prefs!.budget_min) : undefined;
      const maxB = prefs!.budget_max != null ? Number(prefs!.budget_max) : undefined;

      list = list
        .map((h) => ({
          ...h,
          minPrice: byHotel[h.id] ?? Number.MAX_SAFE_INTEGER
        }))
        .filter((h) => {
          const minPrice = (h as { minPrice?: number }).minPrice;
          if (minB != null && minPrice < minB) return false;
          if (maxB != null && minPrice > maxB) return false;
          return true;
        })
        .sort((a, b) => (a as { minPrice: number }).minPrice - (b as { minPrice: number }).minPrice)
        .map(({ minPrice: _, ...rest }) => rest);
    } else {
      // Default: show all verified hotels (no rating filter); optional sort by rating for display
      list = list.sort((a, b) => b.average_rating - a.average_rating);
    }

    // Attach signed profile_image_url
    for (const row of list) {
      if (row.profile_image) {
        const { data: signed } = await supabaseAdmin.storage
          .from("hotel-assets")
          .createSignedUrl(row.profile_image, 3600);
        if (signed?.signedUrl) row.profile_image_url = signed.signedUrl;
      }
    }

    res.json(list);
  }
);

export default router;
