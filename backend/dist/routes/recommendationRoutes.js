"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabaseClient_1 = require("../config/supabaseClient");
const auth_1 = require("../middleware/auth");
const geminiPersonalizedRecommendations_1 = require("../services/geminiPersonalizedRecommendations");
const router = (0, express_1.Router)();
/** Fetch review aggregates (average_rating, review_count) by hotel_id from reviews -> bookings -> rooms. */
async function getReviewAggregatesByHotel() {
    const { data: reviewsData, error } = await supabaseClient_1.supabaseClient
        .from("reviews")
        .select("rating, bookings(room_id, rooms(hotel_id))");
    if (error)
        return new Map();
    const byHotel = new Map();
    const rows = (reviewsData ?? []);
    for (const r of rows) {
        const hotelId = r.bookings?.rooms?.hotel_id;
        if (!hotelId)
            continue;
        const arr = byHotel.get(hotelId) ?? [];
        arr.push(r.rating);
        byHotel.set(hotelId, arr);
    }
    const result = new Map();
    for (const [hotelId, ratings] of byHotel) {
        const sum = ratings.reduce((a, b) => a + b, 0);
        result.set(hotelId, {
            average_rating: sum / ratings.length,
            review_count: ratings.length
        });
    }
    return result;
}
router.get("/recommendations", auth_1.authenticate, async (req, res) => {
    const userId = req.user.sub;
    // Prefs: use admin when no Supabase token so recommendations still work
    let prefs = null;
    if (req.supabaseAccessToken) {
        const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
        const { data, error } = await db
            .from("user_preferences")
            .select("*")
            .eq("user_id", userId)
            .single();
        if (!error && data)
            prefs = data;
    }
    else {
        const { data } = await supabaseClient_1.supabaseAdmin
            .from("user_preferences")
            .select("budget_min, budget_max")
            .eq("user_id", userId)
            .single();
        if (data)
            prefs = data;
    }
    const { data: hotels, error: hotelsError } = await supabaseClient_1.supabaseClient
        .from("hotels")
        .select("id, name, address, images, profile_image")
        .eq("verification_status", "verified");
    if (hotelsError) {
        res.status(500).json({ error: "Failed to load hotels" });
        return;
    }
    const aggregates = await getReviewAggregatesByHotel();
    let list = (hotels ?? []).map((h) => {
        const row = h;
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
    if (hasPrefs && (prefs.budget_min != null || prefs.budget_max != null)) {
        const { data: pricedRooms } = await supabaseClient_1.supabaseClient
            .from("rooms")
            .select("hotel_id, base_price_night");
        const byHotel = {};
        (pricedRooms ?? []).forEach((r) => {
            const price = Number(r.base_price_night);
            const cur = byHotel[r.hotel_id];
            if (cur == null || price < cur)
                byHotel[r.hotel_id] = price;
        });
        const minB = prefs.budget_min != null ? Number(prefs.budget_min) : undefined;
        const maxB = prefs.budget_max != null ? Number(prefs.budget_max) : undefined;
        list = list
            .map((h) => ({
            ...h,
            minPrice: byHotel[h.id] ?? Number.MAX_SAFE_INTEGER
        }))
            .filter((h) => {
            const minPrice = h.minPrice;
            if (minB != null && minPrice < minB)
                return false;
            if (maxB != null && minPrice > maxB)
                return false;
            return true;
        })
            .sort((a, b) => a.minPrice - b.minPrice)
            .map(({ minPrice: _, ...rest }) => rest);
    }
    else {
        // Default: show all verified hotels (no rating filter); optional sort by rating for display
        list = list.sort((a, b) => b.average_rating - a.average_rating);
    }
    const { data: roomPriceRows } = await supabaseClient_1.supabaseClient
        .from("rooms")
        .select("hotel_id, base_price_night");
    const minPriceByHotel = new Map();
    for (const r of roomPriceRows ?? []) {
        const row = r;
        const p = Number(row.base_price_night);
        if (!Number.isFinite(p))
            continue;
        const cur = minPriceByHotel.get(row.hotel_id);
        if (cur == null || p < cur)
            minPriceByHotel.set(row.hotel_id, p);
    }
    for (const row of list) {
        const minP = minPriceByHotel.get(row.id);
        row.min_price_night =
            minP != null && Number.isFinite(minP) ? minP : null;
    }
    // Attach signed profile_image_url
    for (const row of list) {
        if (row.profile_image) {
            const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(row.profile_image, 3600);
            if (signed?.signedUrl)
                row.profile_image_url = signed.signedUrl;
        }
    }
    res.json(list);
});
/** GET /api/recommendations/personalized — guest only; Gemini-ranked hotels + narrative from saved preferences. */
router.get("/recommendations/personalized", auth_1.authenticate, (0, auth_1.requireRole)("guest"), async (req, res) => {
    const userId = req.user.sub;
    let prefsRow = null;
    if (req.supabaseAccessToken) {
        const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
        const { data, error } = await db
            .from("user_preferences")
            .select("budget_min, budget_max, amenities, travel_needs, hotel_preferences")
            .eq("user_id", userId)
            .single();
        if (!error && data)
            prefsRow = data;
    }
    else {
        const { data } = await supabaseClient_1.supabaseAdmin
            .from("user_preferences")
            .select("budget_min, budget_max, amenities, travel_needs, hotel_preferences")
            .eq("user_id", userId)
            .single();
        if (data)
            prefsRow = data;
    }
    const prefs = prefsRow ?? {
        budget_min: null,
        budget_max: null,
        amenities: [],
        travel_needs: null,
        hotel_preferences: null,
    };
    const catalog = await (0, geminiPersonalizedRecommendations_1.loadVerifiedHotelCatalog)(36);
    if (catalog.length === 0) {
        res.json({
            summary: "No verified hotels are available yet. Check back soon.",
            ai_enabled: false,
            hotels: [],
        });
        return;
    }
    let summary;
    let ranked;
    const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim());
    try {
        const out = await (0, geminiPersonalizedRecommendations_1.rankHotelsWithGemini)(prefs, catalog);
        summary = out.summary;
        ranked = out.ranked;
    }
    catch (e) {
        console.error("[recommendations/personalized] Gemini error:", e);
        summary =
            "We couldn’t generate AI picks right now. Try again later — your saved preferences are still used for standard recommendations.";
        ranked = [];
    }
    const catalogIds = catalog.map((c) => c.id);
    const { data: hotels, error: hotelsError } = await supabaseClient_1.supabaseClient
        .from("hotels")
        .select("id, name, address, images, profile_image")
        .eq("verification_status", "verified")
        .in("id", catalogIds);
    if (hotelsError) {
        res.status(500).json({ error: "Failed to load hotels" });
        return;
    }
    const aggregates = await getReviewAggregatesByHotel();
    let list = (hotels ?? []).map((h) => {
        const row = h;
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
    const { data: roomPriceRows } = await supabaseClient_1.supabaseClient
        .from("rooms")
        .select("hotel_id, base_price_night");
    const minPriceByHotel = new Map();
    for (const r of roomPriceRows ?? []) {
        const row = r;
        const p = Number(row.base_price_night);
        if (!Number.isFinite(p))
            continue;
        const cur = minPriceByHotel.get(row.hotel_id);
        if (cur == null || p < cur)
            minPriceByHotel.set(row.hotel_id, p);
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
        const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
        const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
        if (ia !== ib)
            return ia - ib;
        return b.average_rating - a.average_rating;
    });
    for (const row of list) {
        if (row.profile_image) {
            const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(row.profile_image, 3600);
            if (signed?.signedUrl)
                row.profile_image_url = signed.signedUrl;
        }
    }
    res.json({
        summary,
        ai_enabled: hasKey && ranked.length > 0,
        hotels: list,
    });
});
exports.default = router;
