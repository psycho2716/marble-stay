import { Router } from "express";
import type { Request } from "express";
import {
  supabaseClient,
  supabaseAdmin,
  createSupabaseClientForUser
} from "../config/supabaseClient";
import { authenticate, requireRole } from "../middleware/auth";
import {
  loadVerifiedHotelCatalog,
  rankHotelsWithGemini,
  type GeminiRankRow,
  type UserPrefsForAI,
} from "../services/geminiPersonalizedRecommendations";

const router = Router();

/** 12 hours — personalized "For you" AI + enrichment cache per guest (reduces Gemini cost). */
const PERSONALIZED_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type PersonalizedHotelRow = {
  id: string;
  name: string;
  address: string | null;
  images: string[] | null;
  profile_image: string | null;
  profile_image_url?: string | null;
  average_rating: number;
  review_count: number;
  min_price_night?: number | null;
  ai_match_score?: number | null;
  ai_match_why?: string | null;
  ai_room_ideas?: string[] | null;
};

type CachedPersonalizedResponse = {
  summary: string;
  ai_enabled: boolean;
  hotels: PersonalizedHotelRow[];
};

async function signPersonalizedHotelProfileUrls(hotels: PersonalizedHotelRow[]): Promise<void> {
  for (const row of hotels) {
    row.profile_image_url = null;
    if (row.profile_image) {
      const { data: signed } = await supabaseAdmin.storage
        .from("hotel-assets")
        .createSignedUrl(row.profile_image, 3600);
      if (signed?.signedUrl) row.profile_image_url = signed.signedUrl;
    }
  }
}

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

    const { data: roomPriceRows } = await supabaseClient
      .from("rooms")
      .select("hotel_id, base_price_night");
    const minPriceByHotel = new Map<string, number>();
    for (const r of roomPriceRows ?? []) {
      const row = r as { hotel_id: string; base_price_night: number | string };
      const p = Number(row.base_price_night);
      if (!Number.isFinite(p)) continue;
      const cur = minPriceByHotel.get(row.hotel_id);
      if (cur == null || p < cur) minPriceByHotel.set(row.hotel_id, p);
    }
    for (const row of list) {
      const minP = minPriceByHotel.get(row.id);
      (row as { min_price_night?: number | null }).min_price_night =
        minP != null && Number.isFinite(minP) ? minP : null;
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

/** GET /api/recommendations/personalized — guest only; Gemini-ranked hotels + narrative from saved preferences. */
router.get(
  "/recommendations/personalized",
  authenticate,
  requireRole("guest"),
  async (req: Request, res): Promise<void> => {
    const userId = req.user!.sub;

    const { data: cacheRow, error: cacheReadErr } = await supabaseAdmin
      .from("personalized_recommendation_cache")
      .select("response_json, expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!cacheReadErr && cacheRow?.response_json && cacheRow.expires_at) {
      const expMs = new Date(cacheRow.expires_at).getTime();
      if (expMs > Date.now()) {
        const parsed = cacheRow.response_json as CachedPersonalizedResponse;
        if (
          typeof parsed.summary === "string" &&
          typeof parsed.ai_enabled === "boolean" &&
          Array.isArray(parsed.hotels)
        ) {
          const hotelsOut = structuredClone(parsed.hotels) as PersonalizedHotelRow[];
          await signPersonalizedHotelProfileUrls(hotelsOut);
          res.json({
            summary: parsed.summary,
            ai_enabled: parsed.ai_enabled,
            hotels: hotelsOut,
            cache: { hit: true, expires_at: cacheRow.expires_at },
          });
          return;
        }
      }
    }

    let prefsRow: UserPrefsForAI | null = null;
    if (req.supabaseAccessToken) {
      const db = createSupabaseClientForUser(req.supabaseAccessToken);
      const { data, error } = await db
        .from("user_preferences")
        .select("budget_min, budget_max, amenities, travel_needs, hotel_preferences")
        .eq("user_id", userId)
        .single();
      if (!error && data) prefsRow = data as UserPrefsForAI;
    } else {
      const { data } = await supabaseAdmin
        .from("user_preferences")
        .select("budget_min, budget_max, amenities, travel_needs, hotel_preferences")
        .eq("user_id", userId)
        .single();
      if (data) prefsRow = data as UserPrefsForAI;
    }

    const prefs: UserPrefsForAI = prefsRow ?? {
      budget_min: null,
      budget_max: null,
      amenities: [],
      travel_needs: null,
      hotel_preferences: null,
    };

    const catalog = await loadVerifiedHotelCatalog(36);
    if (catalog.length === 0) {
      res.json({
        summary: "No verified hotels are available yet. Check back soon.",
        ai_enabled: false,
        hotels: [],
      });
      return;
    }

    let summary: string;
    let ranked: GeminiRankRow[];
    let geminiFailed = false;
    const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim());
    try {
      const out = await rankHotelsWithGemini(prefs, catalog);
      summary = out.summary;
      ranked = out.ranked;
    } catch (e) {
      geminiFailed = true;
      console.error("[recommendations/personalized] Gemini error:", e);
      summary =
        "We couldn’t generate AI picks right now. Try again later — your saved preferences are still used for standard recommendations.";
      ranked = [];
    }

    const catalogIds = catalog.map((c) => c.id);
    const { data: hotels, error: hotelsError } = await supabaseClient
      .from("hotels")
      .select("id, name, address, images, profile_image")
      .eq("verification_status", "verified")
      .in("id", catalogIds);

    if (hotelsError) {
      res.status(500).json({ error: "Failed to load hotels" });
      return;
    }

    const aggregates = await getReviewAggregatesByHotel();
    type HotelRow = {
      id: string;
      name: string;
      address: string | null;
      images: string[] | null;
      profile_image: string | null;
    };
    let list: Array<
      HotelRow & {
        average_rating: number;
        review_count: number;
        profile_image_url?: string | null;
        min_price_night?: number | null;
        ai_match_score?: number | null;
        ai_match_why?: string | null;
        ai_room_ideas?: string[] | null;
      }
    > = (hotels ?? []).map((h) => {
      const row = h as HotelRow;
      const agg = aggregates.get(row.id);
      return {
        ...row,
        address: row.address ?? null,
        images: row.images ?? null,
        profile_image: row.profile_image ?? null,
        average_rating: agg?.average_rating ?? 0,
        review_count: agg?.review_count ?? 0,
      };
    });

    const { data: roomPriceRows } = await supabaseClient
      .from("rooms")
      .select("hotel_id, base_price_night");
    const minPriceByHotel = new Map<string, number>();
    for (const r of roomPriceRows ?? []) {
      const row = r as { hotel_id: string; base_price_night: number | string };
      const p = Number(row.base_price_night);
      if (!Number.isFinite(p)) continue;
      const cur = minPriceByHotel.get(row.hotel_id);
      if (cur == null || p < cur) minPriceByHotel.set(row.hotel_id, p);
    }
    for (const row of list) {
      const minP = minPriceByHotel.get(row.id);
      row.min_price_night = minP != null && Number.isFinite(minP) ? minP : null;
    }

    const rankMeta = new Map(ranked.map((r, i) => [r.hotel_id, { ...r, order: i }]));
    for (const row of list) {
      const g = rankMeta.get(row.id);
      if (g) {
        row.ai_match_score = g.match_score;
        row.ai_match_why = g.why;
        row.ai_room_ideas = g.room_ideas ?? null;
      }
    }

    const orderMap = new Map(ranked.map((r, i) => [r.hotel_id, i]));
    list.sort((a, b) => {
      const ia = orderMap.has(a.id) ? (orderMap.get(a.id) as number) : 999;
      const ib = orderMap.has(b.id) ? (orderMap.get(b.id) as number) : 999;
      if (ia !== ib) return ia - ib;
      return b.average_rating - a.average_rating;
    });

    const expiresAt = new Date(Date.now() + PERSONALIZED_CACHE_TTL_MS).toISOString();
    const aiEnabled = hasKey && ranked.length > 0;

    if (!geminiFailed) {
      const hotelsForCache = structuredClone(list) as PersonalizedHotelRow[];
      const { error: cacheWriteErr } = await supabaseAdmin
        .from("personalized_recommendation_cache")
        .upsert(
          {
            user_id: userId,
            response_json: {
              summary,
              ai_enabled: aiEnabled,
              hotels: hotelsForCache,
            },
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      if (cacheWriteErr) {
        console.warn("[recommendations/personalized] cache upsert:", cacheWriteErr.message);
      }
    }

    await signPersonalizedHotelProfileUrls(list as PersonalizedHotelRow[]);

    res.json({
      summary,
      ai_enabled: aiEnabled,
      hotels: list,
      cache: {
        hit: false,
        expires_at: geminiFailed ? null : expiresAt,
      },
    });
  }
);

export default router;
