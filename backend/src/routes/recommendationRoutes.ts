import { Router } from "express";
import type { Request } from "express";
import {
    supabaseClient,
    supabaseAdmin,
    createSupabaseClientForUser
} from "../config/supabaseClient";
import { authenticate, requireRole } from "../middleware/auth";
import { resolveHotelAssetUrl } from "../lib/resolveHotelAssetUrl";

const router = Router();

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
};

type GuestPrefs = {
    budget_min: number | null;
    budget_max: number | null;
    amenities: unknown;
    travel_needs: string | null;
    hotel_preferences: string | null;
};

type HotelRoomAgg = {
    minPrice: number;
    amenityUnion: Set<string>;
};

async function signPersonalizedHotelProfileUrls(hotels: PersonalizedHotelRow[]): Promise<void> {
    for (const row of hotels) {
        row.profile_image_url = null;
        if (row.profile_image) {
            const url = await resolveHotelAssetUrl(row.profile_image);
            if (url) row.profile_image_url = url;
        }
    }
}

/**
 * Lowest nightly rate per hotel from available rooms (service role; avoids stale cache / anon RLS edge cases).
 * Skips null/empty prices — never treat `Number(null)` as 0.
 */
async function attachMinPricePerNightToHotels<
    T extends { id: string; min_price_night?: number | null }
>(hotels: T[]): Promise<void> {
    if (hotels.length === 0) return;
    const ids = [
        ...new Set(hotels.map((h) => h.id).filter((id): id is string => typeof id === "string"))
    ];
    if (ids.length === 0) return;

    const { data, error } = await supabaseAdmin
        .from("rooms")
        .select("hotel_id, base_price_night")
        .in("hotel_id", ids)
        .eq("is_available", true);

    if (error) {
        console.warn("[recommendations] attachMinPricePerNightToHotels:", error.message);
        return;
    }
    if (!data?.length) {
        for (const h of hotels) {
            h.min_price_night = null;
        }
        return;
    }

    const minPriceByHotel = new Map<string, number>();
    for (const r of data) {
        const hid = (r as { hotel_id?: unknown }).hotel_id;
        const raw = (r as { base_price_night?: unknown }).base_price_night;
        if (typeof hid !== "string" || raw == null || raw === "") continue;
        const p = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(p)) continue;
        const cur = minPriceByHotel.get(hid);
        if (cur == null || p < cur) minPriceByHotel.set(hid, p);
    }

    for (const h of hotels) {
        const minP = minPriceByHotel.get(h.id);
        h.min_price_night = minP != null && Number.isFinite(minP) ? minP : null;
    }
}

function normalizePreferenceAmenities(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => String(x).trim().toLowerCase()).filter((s) => s.length > 0);
}

function roomAmenitiesTokens(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => String(x).trim().toLowerCase()).filter((s) => s.length > 0);
}

function amenityMatchCount(guestAmenities: string[], hotelUnion: Set<string>): number {
    if (guestAmenities.length === 0) return 0;
    let n = 0;
    for (const a of guestAmenities) {
        if (hotelUnion.has(a)) n += 1;
    }
    return n;
}

/** Fetch review aggregates (average_rating, review_count) by hotel_id from reviews -> bookings -> rooms. */
async function getReviewAggregatesByHotel(): Promise<
    Map<string, { average_rating: number; review_count: number }>
> {
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

function buildPersonalizedSummary(opts: {
    guestAmenities: string[];
    usedAmenityFilter: boolean;
    budgetMin?: number;
    budgetMax?: number;
}): string {
    const parts: string[] = [
        "These verified stays are ranked using your saved preferences: amenity overlap (when you picked any), then guest ratings, then lowest nightly rate."
    ];

    const { budgetMin, budgetMax, guestAmenities, usedAmenityFilter } = opts;
    if (budgetMin != null || budgetMax != null) {
        if (budgetMin != null && budgetMax != null) {
            parts.push(
                `Budget filter: about ₱${budgetMin.toLocaleString("en-PH")}–₱${budgetMax.toLocaleString("en-PH")} per night.`
            );
        } else if (budgetMin != null) {
            parts.push(
                `Budget filter: from about ₱${budgetMin.toLocaleString("en-PH")} per night.`
            );
        } else if (budgetMax != null) {
            parts.push(
                `Budget filter: up to about ₱${budgetMax.toLocaleString("en-PH")} per night.`
            );
        }
    }

    if (guestAmenities.length > 0 && !usedAmenityFilter) {
        parts.push(
            "None of the stays in your budget matched the amenities you selected on their room listings, so all budget matches are shown."
        );
    }

    return parts.join(" ");
}

router.get("/recommendations", authenticate, async (req: Request, res): Promise<void> => {
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
        if (!error && data)
            prefs = data as { budget_min?: number | null; budget_max?: number | null };
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
            review_count: agg?.review_count ?? 0
        };
    });

    // When preferences are set (e.g. budget), filter/sort by them; otherwise show all (default)
    const hasPrefs = prefs && (prefs.budget_min != null || prefs.budget_max != null);
    if (hasPrefs && (prefs!.budget_min != null || prefs!.budget_max != null)) {
        const { data: pricedRooms } = await supabaseClient
            .from("rooms")
            .select("hotel_id, base_price_night")
            .eq("is_available", true);

        const byHotel: Record<string, number> = {};
        (pricedRooms ?? []).forEach((r: { hotel_id: string; base_price_night: unknown }) => {
            const raw = r.base_price_night;
            if (raw == null || raw === "") return;
            const price = typeof raw === "number" ? raw : Number(raw);
            if (!Number.isFinite(price)) return;
            const cur = byHotel[r.hotel_id];
            if (cur == null || price < cur) byHotel[r.hotel_id] = price;
        });

        const minB = prefs!.budget_min != null ? Number(prefs!.budget_min) : undefined;
        const maxB = prefs!.budget_max != null ? Number(prefs!.budget_max) : undefined;

        list = list
            .map((h): typeof h & { minPrice: number } => ({
                ...h,
                minPrice: byHotel[h.id] ?? Number.MAX_SAFE_INTEGER
            }))
            .filter((h) => {
                const minPrice = h.minPrice;
                if (minB != null && minPrice < minB) return false;
                if (maxB != null && minPrice > maxB) return false;
                return true;
            })
            .sort((a, b) => a.minPrice - b.minPrice)
            .map(({ minPrice: _, ...rest }) => rest);
    } else {
        // Default: show all verified hotels (no rating filter); optional sort by rating for display
        list = list.sort((a, b) => b.average_rating - a.average_rating);
    }

    await attachMinPricePerNightToHotels(
        list as Array<{ id: string; min_price_night?: number | null }>
    );

    // Attach profile_image_url (storage path or https demo URL)
    for (const row of list) {
        if (row.profile_image) {
            const url = await resolveHotelAssetUrl(row.profile_image);
            if (url) row.profile_image_url = url;
        }
    }

    res.json(list);
});

/** GET /api/recommendations/personalized — guest only; preferences + DB ranking (no external AI). */
router.get(
    "/recommendations/personalized",
    authenticate,
    requireRole("guest"),
    async (req: Request, res): Promise<void> => {
        const userId = req.user!.sub;
        let prefsRow: GuestPrefs | null = null;
        if (req.supabaseAccessToken) {
            const db = createSupabaseClientForUser(req.supabaseAccessToken);
            const { data, error } = await db
                .from("user_preferences")
                .select("budget_min, budget_max, amenities, travel_needs, hotel_preferences")
                .eq("user_id", userId)
                .single();
            if (!error && data) prefsRow = data as GuestPrefs;
        } else {
            const { data } = await supabaseAdmin
                .from("user_preferences")
                .select("budget_min, budget_max, amenities, travel_needs, hotel_preferences")
                .eq("user_id", userId)
                .single();
            if (data) prefsRow = data as GuestPrefs;
        }

        const prefs: GuestPrefs = prefsRow ?? {
            budget_min: null,
            budget_max: null,
            amenities: [],
            travel_needs: null,
            hotel_preferences: null
        };

        const guestAmenities = normalizePreferenceAmenities(prefs.amenities);
        const minB = prefs.budget_min != null ? Number(prefs.budget_min) : undefined;
        const maxB = prefs.budget_max != null ? Number(prefs.budget_max) : undefined;

        const { data: hotelRows, error: hotelsError } = await supabaseAdmin
            .from("hotels")
            .select("id, name, address, images, profile_image")
            .eq("verification_status", "verified");

        if (hotelsError) {
            res.status(500).json({ error: "Failed to load hotels" });
            return;
        }

        const { data: roomRows, error: roomsError } = await supabaseAdmin
            .from("rooms")
            .select("hotel_id, base_price_night, amenities")
            .eq("is_available", true);

        if (roomsError) {
            res.status(500).json({ error: "Failed to load rooms" });
            return;
        }

        const aggByHotel = new Map<string, HotelRoomAgg>();
        for (const r of roomRows ?? []) {
            const hid = (r as { hotel_id?: unknown }).hotel_id;
            const raw = (r as { base_price_night?: unknown }).base_price_night;
            const amenitiesRaw = (r as { amenities?: unknown }).amenities;
            if (typeof hid !== "string" || raw == null || raw === "") continue;
            const p = typeof raw === "number" ? raw : Number(raw);
            if (!Number.isFinite(p)) continue;

            let entry = aggByHotel.get(hid);
            if (!entry) {
                entry = { minPrice: p, amenityUnion: new Set<string>() };
            } else {
                entry.minPrice = Math.min(entry.minPrice, p);
            }
            for (const token of roomAmenitiesTokens(amenitiesRaw)) {
                entry.amenityUnion.add(token);
            }
            aggByHotel.set(hid, entry);
        }

        const aggregates = await getReviewAggregatesByHotel();

        type Cand = {
            id: string;
            name: string;
            address: string | null;
            images: string[] | null;
            profile_image: string | null;
            minPrice: number;
            amenityMatch: number;
            average_rating: number;
            review_count: number;
        };

        const cands: Cand[] = [];
        for (const h of hotelRows ?? []) {
            const row = h as {
                id: string;
                name: string;
                address: string | null;
                images: string[] | null;
                profile_image: string | null;
            };
            const agg = aggByHotel.get(row.id);
            if (!agg) continue;

            const minPrice = agg.minPrice;
            if (minB != null && minPrice < minB) continue;
            if (maxB != null && minPrice > maxB) continue;

            const ra = aggregates.get(row.id);
            const amenityMatch = amenityMatchCount(guestAmenities, agg.amenityUnion);
            cands.push({
                id: row.id,
                name: row.name,
                address: row.address ?? null,
                images: row.images ?? null,
                profile_image: row.profile_image ?? null,
                minPrice,
                amenityMatch,
                average_rating: ra?.average_rating ?? 0,
                review_count: ra?.review_count ?? 0
            });
        }

        let usedAmenityFilter = false;
        let working = cands;
        if (guestAmenities.length > 0) {
            const withAmenity = cands.filter((c) => c.amenityMatch > 0);
            if (withAmenity.length > 0) {
                working = withAmenity;
                usedAmenityFilter = true;
            }
        }

        working.sort((a, b) => {
            if (b.amenityMatch !== a.amenityMatch) return b.amenityMatch - a.amenityMatch;
            if (b.average_rating !== a.average_rating) return b.average_rating - a.average_rating;
            return a.minPrice - b.minPrice;
        });

        const list: PersonalizedHotelRow[] = working.map((c) => ({
            id: c.id,
            name: c.name,
            address: c.address,
            images: c.images,
            profile_image: c.profile_image,
            average_rating: c.average_rating,
            review_count: c.review_count,
            min_price_night: c.minPrice
        }));

        await signPersonalizedHotelProfileUrls(list);

        const summary = buildPersonalizedSummary({
            guestAmenities,
            usedAmenityFilter,
            budgetMin: minB,
            budgetMax: maxB
        });

        if (list.length === 0) {
            res.json({
                summary:
                    "No verified stays match your current budget and filters. Try widening your budget or clearing amenity picks under Profile → Preferences.",
                hotels: []
            });
            return;
        }

        res.json({
            summary,
            hotels: list
        });
    }
);

export default router;
