import { Router } from "express";
import multer from "multer";
import {
    supabaseAdmin,
    supabaseClient,
    createSupabaseClientForUser
} from "../config/supabaseClient";
import { authenticate, requireRole } from "../middleware/auth";
import {
    notifyGuestBookingConfirmed,
    notifyGuestBookingDeclined,
    notifyGuestPaymentApproved,
    notifyGuestReceiptRejected
} from "../realtime";
import { resolveHotelAssetUrl } from "../lib/resolveHotelAssetUrl";

const router = Router();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Mark confirmed + paid bookings as `completed` once check-out has passed.
 * Used before hotel booking lists so revenue and status stay accurate.
 */
async function autoMarkCompletedStaysForHotel(hotelId: string): Promise<void> {
    const { data: hotelRooms, error: roomsErr } = await supabaseAdmin
        .from("rooms")
        .select("id")
        .eq("hotel_id", hotelId);
    if (roomsErr || !hotelRooms?.length) return;

    const roomIds = hotelRooms.map((r) => (r as { id: string }).id);
    const nowIso = new Date().toISOString();

    const { data: eligible, error: elErr } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .in("room_id", roomIds)
        .eq("status", "confirmed")
        .eq("payment_status", "paid")
        .lt("check_out", nowIso);

    if (elErr || !eligible?.length) return;

    const ids = eligible.map((row) => (row as { id: string }).id);
    const { error: upErr } = await supabaseAdmin
        .from("bookings")
        .update({ status: "completed" })
        .in("id", ids);
    if (upErr) {
        console.warn("[hotel/bookings] autoMarkCompletedStaysForHotel:", upErr.message);
    }
}

/** Normalize hourly_available_hours: array of 0-23, or null when not offering hourly. */
function normalizeHourlyAvailableHours(raw: unknown, offerHourly: boolean): number[] | null {
    if (!offerHourly) return null;
    if (!raw) return null;
    const arr = Array.isArray(raw)
        ? raw
        : typeof raw === "string"
          ? (() => {
                try {
                    return JSON.parse(raw) as unknown;
                } catch {
                    return null;
                }
            })()
          : null;
    if (!Array.isArray(arr)) return null;
    const hours = arr
        .map((h) => (typeof h === "number" ? h : Number(h)))
        .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
    return [...new Set(hours)].sort((a, b) => a - b);
}

function getRoomIdFromReviewBookingRelation(
    bookings: unknown
): string | null {
    if (Array.isArray(bookings)) {
        const roomId = bookings[0] && typeof bookings[0] === "object"
            ? (bookings[0] as { room_id?: unknown }).room_id
            : null;
        return typeof roomId === "string" ? roomId : null;
    }

    if (bookings && typeof bookings === "object") {
        const roomId = (bookings as { room_id?: unknown }).room_id;
        return typeof roomId === "string" ? roomId : null;
    }

    return null;
}

function getHotelIdFromReviewBookingRelation(
    bookings: unknown
): string | null {
    const bookingRecord =
        Array.isArray(bookings) ? bookings[0] : bookings;

    if (!bookingRecord || typeof bookingRecord !== "object") {
        return null;
    }

    const rooms = (bookingRecord as { rooms?: unknown }).rooms;
    const roomRecord = Array.isArray(rooms) ? rooms[0] : rooms;
    if (!roomRecord || typeof roomRecord !== "object") {
        return null;
    }

    const hotelId = (roomRecord as { hotel_id?: unknown }).hotel_id;
    return typeof hotelId === "string" ? hotelId : null;
}

type ReviewAggregateRecord = {
    booking_id: string;
    rating: number;
    comment: string | null;
    created_at: string;
};

type ReviewRelationMaps = {
    roomIdByBookingId: Map<string, string>;
    hotelIdByRoomId: Map<string, string>;
};

async function getReviewAggregateRecords(): Promise<ReviewAggregateRecord[]> {
    const { data, error } = await supabaseAdmin
        .from("reviews")
        .select("booking_id, rating, comment, created_at");

    if (error || !data) return [];

    return data.flatMap((row) => {
        const bookingId = (row as { booking_id?: unknown }).booking_id;
        const rating = Number((row as { rating?: unknown }).rating);
        const comment = (row as { comment?: unknown }).comment;
        const createdAt = (row as { created_at?: unknown }).created_at;

        if (
            typeof bookingId !== "string" ||
            !Number.isFinite(rating) ||
            typeof createdAt !== "string"
        ) {
            return [];
        }

        return [
            {
                booking_id: bookingId,
                rating,
                comment: typeof comment === "string" ? comment : null,
                created_at: createdAt
            }
        ];
    });
}

async function getReviewRelationMaps(
    bookingIds: string[]
): Promise<ReviewRelationMaps> {
    if (bookingIds.length === 0) {
        return {
            roomIdByBookingId: new Map<string, string>(),
            hotelIdByRoomId: new Map<string, string>()
        };
    }

    const { data: bookingRows, error: bookingsError } = await supabaseAdmin
        .from("bookings")
        .select("id, room_id")
        .in("id", bookingIds);

    if (bookingsError || !bookingRows) {
        return {
            roomIdByBookingId: new Map<string, string>(),
            hotelIdByRoomId: new Map<string, string>()
        };
    }

    const roomIdByBookingId = new Map<string, string>();
    const roomIds = new Set<string>();

    for (const row of bookingRows) {
        const bookingId = (row as { id?: unknown }).id;
        const roomId = (row as { room_id?: unknown }).room_id;
        if (typeof bookingId !== "string" || typeof roomId !== "string") continue;
        roomIdByBookingId.set(bookingId, roomId);
        roomIds.add(roomId);
    }

    if (roomIds.size === 0) {
        return {
            roomIdByBookingId,
            hotelIdByRoomId: new Map<string, string>()
        };
    }

    const { data: roomRows, error: roomsError } = await supabaseAdmin
        .from("rooms")
        .select("id, hotel_id")
        .in("id", Array.from(roomIds));

    if (roomsError || !roomRows) {
        return {
            roomIdByBookingId,
            hotelIdByRoomId: new Map<string, string>()
        };
    }

    const hotelIdByRoomId = new Map<string, string>();
    for (const row of roomRows) {
        const roomId = (row as { id?: unknown }).id;
        const hotelId = (row as { hotel_id?: unknown }).hotel_id;
        if (typeof roomId !== "string" || typeof hotelId !== "string") continue;
        hotelIdByRoomId.set(roomId, hotelId);
    }

    return { roomIdByBookingId, hotelIdByRoomId };
}

async function getReviewAggregateContext(): Promise<{
    reviews: ReviewAggregateRecord[];
    relationMaps: ReviewRelationMaps;
}> {
    const reviews = await getReviewAggregateRecords();
    const bookingIds = Array.from(new Set(reviews.map((review) => review.booking_id)));
    const relationMaps = await getReviewRelationMaps(bookingIds);

    return { reviews, relationMaps };
}

const ALLOWED_CUSTOM_POLICY_ICON_KEYS = [
    // Must match the frontend predefined icon keys
    "shield",
    "wifi",
    "waves",
    "dumbbell",
    "car",
    "utensils_crossed",
    "snowflake",
    "circle_dot"
] as const;

type AllowedCustomPolicyIconKey = (typeof ALLOWED_CUSTOM_POLICY_ICON_KEYS)[number];

function sanitizeCustomPolicies(raw: unknown): Array<{
    iconKey: AllowedCustomPolicyIconKey;
    label: string;
    value: string;
}> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{
        iconKey: AllowedCustomPolicyIconKey;
        label: string;
        value: string;
    }> = [];

    for (const item of raw.slice(0, 10)) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;

        const iconKeyRaw =
            (typeof obj.iconKey === "string" && obj.iconKey) ||
            (typeof obj.icon_key === "string" && obj.icon_key) ||
            (typeof obj.icon === "string" && obj.icon) ||
            "";
        const iconKey = iconKeyRaw as AllowedCustomPolicyIconKey;
        if (!ALLOWED_CUSTOM_POLICY_ICON_KEYS.includes(iconKey)) continue;

        const label = typeof obj.label === "string" ? obj.label.trim() : "";
        const value = typeof obj.value === "string" ? obj.value.trim() : "";

        // Only show if both label + value are present.
        if (!label || !value) continue;

        out.push({ iconKey, label, value });
    }

    return out;
}

/** Handler for hotel registration (no auth required). */
async function handleHotelRegister(
    req: import("express").Request,
    res: import("express").Response
) {
    const { email, password, full_name, hotel_name, address, contact_email, contact_phone, latitude, longitude } =
        req.body;
    const cleanEmail = typeof email === "string" ? email.trim() : "";
    const cleanPassword = typeof password === "string" ? password : "";

    const cleanPhone = typeof contact_phone === "string" ? contact_phone.trim() : "";
    if (!cleanEmail || !cleanPassword || !hotel_name || !address || !contact_email || !cleanPhone) {
        res.status(400).json({ error: "Missing required fields" });
        return;
    }

    const lat = latitude != null && latitude !== "" ? Number(latitude) : null;
    const lng = longitude != null && longitude !== "" ? Number(longitude) : null;
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
        res.status(400).json({
            error: "Please set your hotel location on the map (latitude and longitude required)."
        });
        return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        res.status(400).json({ error: "Invalid location coordinates." });
        return;
    }

    const file = req.file;
    let businessPermitUrl: string | null = null;

    if (file) {
        const safeName = (file.originalname || "file").replace(/[^a-zA-Z0-9.-]/g, "_");
        const filePath = `business-permits/${Date.now()}-${safeName}`;
        const { data, error } = await supabaseAdmin.storage
            .from("hotel-assets")
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            res.status(500).json({ error: "Failed to upload business permit file" });
            return;
        }

        businessPermitUrl = data?.path ?? null;
    }

    const role = "hotel";

    const { data: userData, error: userError } = await supabaseClient.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
            data: { full_name, role },
            emailRedirectTo: `${FRONTEND_ORIGIN}/login`
        }
    });

    if (userError || !userData.user) {
        res.status(400).json({ error: userError?.message ?? "Unable to register hotel" });
        return;
    }

    const { data: hotelData, error: hotelError } = await supabaseAdmin
        .from("hotels")
        .insert({
            name: hotel_name,
            description: null,
            address,
            contact_email,
            contact_phone: cleanPhone,
            latitude: lat,
            longitude: lng,
            business_permit_file: businessPermitUrl,
            verification_status: "pending"
        })
        .select("id")
        .single();

    if (hotelError || !hotelData) {
        res.status(500).json({ error: hotelError?.message ?? "Unable to create hotel" });
        return;
    }

    await supabaseAdmin
        .from("profiles")
        .update({ role, hotel_id: hotelData.id, full_name })
        .eq("id", userData.user.id);

    res.status(201).json({
        message:
            "Hotel account created. Please verify your email first, then await admin verification before accessing dashboard.",
        email_verification_sent: true
    });
}

router.post("/register", upload.single("business_permit"), handleHotelRegister);
router.post("/hotels/register", upload.single("business_permit"), handleHotelRegister);

/** GET /api/hotels/top-rated — verified hotels with high average review rating (for landing page). */
router.get("/hotels/top-rated", async (_req, res) => {
    const { reviews, relationMaps } = await getReviewAggregateContext();

    const hotelIds = Array.from(
        new Set(
            reviews.flatMap((review) => {
                const roomId = relationMaps.roomIdByBookingId.get(review.booking_id);
                const hotelId = roomId ? relationMaps.hotelIdByRoomId.get(roomId) : null;
                return hotelId ? [hotelId] : [];
            })
        )
    );

    const { data: hotelRows, error: hotelsError } = await supabaseAdmin
        .from("hotels")
        .select("id, name, address, images, profile_image, verification_status, currency")
        .in("id", hotelIds.length > 0 ? hotelIds : ["00000000-0000-0000-0000-000000000000"]);

    if (hotelsError) {
        res.status(500).json({ error: "Failed to load hotels" });
        return;
    }

    const hotelById = new Map<
        string,
        {
            id: string;
            name: string;
            address: string | null;
            images: string[] | null;
            profile_image: string | null;
            verification_status: string;
            currency?: string | null;
        }
    >();
    for (const row of hotelRows ?? []) {
        const hotelId = (row as { id?: unknown }).id;
        if (typeof hotelId !== "string") continue;
        hotelById.set(hotelId, row as {
            id: string;
            name: string;
            address: string | null;
            images: string[] | null;
            profile_image: string | null;
            verification_status: string;
            currency?: string | null;
        });
    }

    const byHotel = new Map<
        string,
        {
            hotel: {
                id: string;
                name: string;
                address: string | null;
                images: string[] | null;
                profile_image: string | null;
                currency?: string | null;
            };
            ratings: number[];
        }
    >();

    for (const r of reviews) {
        const roomId = relationMaps.roomIdByBookingId.get(r.booking_id);
        const hotelId = roomId ? relationMaps.hotelIdByRoomId.get(roomId) : null;
        const hotel = hotelId ? hotelById.get(hotelId) ?? null : null;
        if (!hotel || hotel.verification_status !== "verified") continue;
        const entry = byHotel.get(hotel.id);
        if (!entry) {
            const h = hotel as {
                id: string;
                name: string;
                address: string | null;
                images: string[] | null;
                profile_image: string | null;
                currency?: string | null;
            };
            byHotel.set(hotel.id, {
                hotel: {
                    id: h.id,
                    name: h.name,
                    address: h.address ?? null,
                    images: h.images ?? null,
                    profile_image: h.profile_image ?? null,
                    currency: h.currency ?? "PHP"
                },
                ratings: [r.rating]
            });
        } else {
            entry.ratings.push(r.rating);
        }
    }

    let result: Array<{
        id: string;
        name: string;
        address: string | null;
        images: string[] | null;
        profile_image?: string | null;
        profile_image_url?: string | null;
        currency?: string | null;
        average_rating: number;
        review_count: number;
    }> = Array.from(byHotel.entries())
        .map(([, v]) => ({
            ...v.hotel,
            average_rating: v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length,
            review_count: v.ratings.length
        }))
        .sort((a, b) => b.average_rating - a.average_rating)
        .slice(0, 6);

    if (result.length === 0) {
        const { data: fallback } = await supabaseClient
            .from("hotels")
            .select("id, name, address, images, profile_image, currency")
            .eq("verification_status", "verified")
            .order("created_at", { ascending: false })
            .limit(6);
        result = (fallback ?? []).map((h) => ({
            ...h,
            address: (h as { address?: string | null }).address ?? null,
            images: (h as { images?: string[] | null }).images ?? null,
            profile_image: (h as { profile_image?: string | null }).profile_image ?? null,
            currency: (h as { currency?: string | null }).currency ?? "PHP",
            average_rating: 0,
            review_count: 0
        }));
    }

    // Add profile_image_url (signed storage path or passthrough https demo URLs)
    for (const row of result) {
        const profileImage = (row as { profile_image?: string | null }).profile_image;
        if (profileImage) {
            const url = await resolveHotelAssetUrl(profileImage);
            if (url) (row as Record<string, unknown>).profile_image_url = url;
        }
    }

    res.json(result);
});

const HOTELS_PAGE_SIZE = 8;

router.get("/hotels", async (req, res) => {
    const minPriceQ = typeof req.query.minPrice === "string" ? Number(req.query.minPrice) : null;
    const maxPriceQ = typeof req.query.maxPrice === "string" ? Number(req.query.maxPrice) : null;
    const ratingMinQ = typeof req.query.rating === "string" ? Number(req.query.rating) : null;
    const amenitiesQ =
        typeof req.query.amenities === "string"
            ? req.query.amenities
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
            : [];
    const locationQ = typeof req.query.location === "string" ? req.query.location.trim() : "";
    const pageRaw = typeof req.query.page === "string" ? parseInt(req.query.page, 10) : 1;
    const limitRaw =
        typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : HOTELS_PAGE_SIZE;
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
    const limit =
        Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 50 ? limitRaw : HOTELS_PAGE_SIZE;

    const minPrice = Number.isFinite(minPriceQ as number) ? (minPriceQ as number) : null;
    const maxPrice = Number.isFinite(maxPriceQ as number) ? (maxPriceQ as number) : null;
    const ratingMin = Number.isFinite(ratingMinQ as number) ? (ratingMinQ as number) : null;

    const { data: hotelsRaw, error: hotelsError } = await supabaseClient
        .from("hotels")
        .select("*")
        .eq("verification_status", "verified")
        .order("created_at", { ascending: false });

    if (hotelsError) {
        res.status(500).json({ error: "Failed to load hotels" });
        return;
    }

    let hotels = (hotelsRaw ?? []) as Array<Record<string, unknown>>;
    if (locationQ) {
        const needle = locationQ.toLowerCase();
        hotels = hotels.filter((h) => {
            const addr = ((h as { address?: unknown }).address ?? "") as string | null;
            return typeof addr === "string" && addr.toLowerCase().includes(needle);
        });
    }
    const hotelIds = hotels.map((h) => h.id).filter((id): id is string => typeof id === "string");

    // Load rooms for pricing + amenities filtering (published rooms = available rooms on verified hotels)
    const { data: roomsRaw, error: roomsError } = await supabaseClient
        .from("rooms")
        .select("hotel_id, base_price_night, amenities")
        .in("hotel_id", hotelIds)
        .eq("is_available", true);

    if (roomsError) {
        res.status(500).json({ error: "Failed to load hotel rooms for filtering" });
        return;
    }

    const roomsByHotel = new Map<string, Array<{ price: number | null; amenities: string[] }>>();
    for (const r of roomsRaw ?? []) {
        const hid = (r as { hotel_id?: unknown }).hotel_id;
        if (typeof hid !== "string") continue;
        const priceRaw = (r as { base_price_night?: unknown }).base_price_night;
        const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
        const amenities = Array.isArray((r as { amenities?: unknown }).amenities)
            ? ((r as { amenities?: unknown }).amenities as unknown[]).filter(
                  (a): a is string => typeof a === "string" && a.trim().length > 0
              )
            : [];
        const entry = roomsByHotel.get(hid) ?? [];
        entry.push({ price: Number.isFinite(price) ? price : null, amenities });
        roomsByHotel.set(hid, entry);
    }

    const result: Record<string, unknown>[] = [];
    for (const h of hotels) {
        const hid = h.id as string | undefined;
        if (!hid) continue;

        // rating filter (if available)
        if (ratingMin != null) {
            const r = Number((h as { average_rating?: unknown }).average_rating ?? 0);
            if (!Number.isFinite(r) || r < ratingMin) continue;
        }

        const rooms = roomsByHotel.get(hid) ?? [];
        if (rooms.length === 0) continue;

        // Apply room-level filters (price + amenities) and ensure at least one room matches.
        const matches = rooms.filter((room) => {
            const price = room.price;
            if (minPrice != null && price != null && price < minPrice) return false;
            if (maxPrice != null && price != null && price > maxPrice) return false;
            if (amenitiesQ.length > 0) {
                const set = new Set(room.amenities.map((a) => a.toLowerCase()));
                for (const a of amenitiesQ) {
                    if (!set.has(a.toLowerCase())) return false;
                }
            }
            return true;
        });

        if (matches.length === 0) continue;

        const minRoomPrice = matches
            .map((m) => m.price)
            .filter((p): p is number => typeof p === "number" && Number.isFinite(p))
            .sort((a, b) => a - b)[0];

        const out = { ...h } as Record<string, unknown>;
        if (minRoomPrice != null) out.min_price = String(minRoomPrice);
        result.push(out);
    }

    // Attach average_rating / review_count (same source as /hotels/top-rated).
    const hotelIdSet = new Set(
        result.map((h) => h.id).filter((id): id is string => typeof id === "string")
    );
    if (hotelIdSet.size > 0) {
        const { reviews, relationMaps } = await getReviewAggregateContext();
        const sumByHotel = new Map<string, { sum: number; count: number }>();

        for (const review of reviews) {
            const roomId = relationMaps.roomIdByBookingId.get(review.booking_id);
            const hotelId = roomId ? relationMaps.hotelIdByRoomId.get(roomId) : null;
            if (!hotelId || !hotelIdSet.has(hotelId)) continue;

            const cur = sumByHotel.get(hotelId) ?? { sum: 0, count: 0 };
            cur.sum += review.rating;
            cur.count += 1;
            sumByHotel.set(hotelId, cur);
        }

        for (const h of result) {
            const hid = h.id as string | undefined;
            if (!hid) continue;
            const agg = sumByHotel.get(hid);
            (h as Record<string, unknown>).review_count = agg?.count ?? 0;
            (h as Record<string, unknown>).average_rating =
                agg && agg.count > 0 ? agg.sum / agg.count : null;
        }
    }

    // Add signed profile_image_url for each hotel (when present)
    for (const row of result) {
        const profileImage = (row as { profile_image?: string | null }).profile_image;
        if (profileImage) {
            if (/^https?:\/\//i.test(profileImage)) {
                (row as Record<string, unknown>).profile_image_url = profileImage;
            } else {
                const { data: signed } = await supabaseAdmin.storage
                    .from("hotel-assets")
                    .createSignedUrl(profileImage, 3600);
                if (signed?.signedUrl)
                    (row as Record<string, unknown>).profile_image_url = signed.signedUrl;
            }
        }
    }

    const total = result.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageClamped = Math.min(page, totalPages);
    const start = (pageClamped - 1) * limit;
    const paginated = result.slice(start, start + limit);

    res.json({
        hotels: paginated,
        total,
        page: pageClamped,
        limit,
        totalPages
    });
});

/** GET /api/hotels/filters — dynamic filter options (price bounds + amenities) */
router.get("/hotels/filters", async (_req, res) => {
    const { data, error } = await supabaseClient
        .from("rooms")
        .select("base_price_night, amenities, hotels!inner(verification_status)")
        .eq("is_available", true)
        .eq("hotels.verification_status", "verified");

    if (error) {
        res.status(500).json({ error: "Failed to load hotel filters" });
        return;
    }

    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    const amenitySet = new Set<string>();

    for (const row of data ?? []) {
        const priceRaw = (row as { base_price_night?: unknown }).base_price_night;
        const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
        if (Number.isFinite(price)) {
            minPrice = minPrice == null ? price : Math.min(minPrice, price);
            maxPrice = maxPrice == null ? price : Math.max(maxPrice, price);
        }

        const amenities = (row as { amenities?: unknown }).amenities;
        if (Array.isArray(amenities)) {
            for (const a of amenities) {
                if (typeof a === "string" && a.trim()) amenitySet.add(a.trim());
            }
        }
    }

    res.json({
        price: { min: minPrice, max: maxPrice },
        amenities: Array.from(amenitySet).sort((a, b) => a.localeCompare(b))
    });
});

router.get("/hotels/:id", async (req, res) => {
    const hotelId = req.params.id;
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 6));

    const { data: hotel, error: hotelError } = await supabaseClient
        .from("hotels")
        .select("*")
        .eq("id", hotelId)
        .eq("verification_status", "verified")
        .single();

    if (hotelError || !hotel) {
        res.status(404).json({ error: "Hotel not found" });
        return;
    }

    const { count: totalRooms, error: countError } = await supabaseClient
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", hotelId)
        .eq("is_available", true);

    if (countError) {
        res.status(500).json({ error: "Failed to load rooms" });
        return;
    }
    const total = totalRooms ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageClamped = Math.min(page, totalPages);
    const from = (pageClamped - 1) * limit;

    const { data: roomsRaw, error: roomsError } = await supabaseClient
        .from("rooms")
        .select("*")
        .eq("hotel_id", hotelId)
        .eq("is_available", true)
        .order("base_price_night", { ascending: true })
        .range(from, from + limit - 1);

    if (roomsError) {
        res.status(500).json({ error: "Failed to load rooms" });
        return;
    }

    const sumByHotel = new Map<string, { sum: number; count: number }>();
    const sumByRoom = new Map<string, { sum: number; count: number }>();
    const { reviews, relationMaps } = await getReviewAggregateContext();
    for (const review of reviews) {
        const roomId = relationMaps.roomIdByBookingId.get(review.booking_id);
        const hid = roomId ? relationMaps.hotelIdByRoomId.get(roomId) : null;
        if (hid !== hotelId) continue;
        const cur = sumByHotel.get(hotelId) ?? { sum: 0, count: 0 };
        cur.sum += review.rating;
        cur.count += 1;
        sumByHotel.set(hotelId, cur);

        if (roomId) {
            const roomAggregate = sumByRoom.get(roomId) ?? { sum: 0, count: 0 };
            roomAggregate.sum += review.rating;
            roomAggregate.count += 1;
            sumByRoom.set(roomId, roomAggregate);
        }
    }

    const rooms: Record<string, unknown>[] = [];
    for (const room of roomsRaw ?? []) {
        const r = { ...room } as Record<string, unknown>;
        const media = (room.media as { type?: string; path: string }[] | null) ?? [];
        const firstImage = media.find((m) => m?.path && (m.type === "image" || !m.type));
        if (firstImage?.path) {
            const mainUrl = await resolveHotelAssetUrl(firstImage.path);
            if (mainUrl) r.main_image_url = mainUrl;
        }

        const roomId = typeof room.id === "string" ? room.id : null;
        const aggregate = roomId ? sumByRoom.get(roomId) : undefined;
        r.review_count = aggregate?.count ?? 0;
        r.average_rating = aggregate && aggregate.count > 0 ? aggregate.sum / aggregate.count : 0;

        rooms.push(r);
    }
    const agg = sumByHotel.get(hotelId);
    const reviewCount = agg?.count ?? 0;
    const averageRating = agg && agg.count > 0 ? agg.sum / agg.count : null;

    const { data: allRoomsForAmenities } = await supabaseClient
        .from("rooms")
        .select("amenities")
        .eq("hotel_id", hotelId)
        .eq("is_available", true);
    const amenitySet = new Set<string>();
    for (const row of allRoomsForAmenities ?? []) {
        const amenities = (row as { amenities?: unknown }).amenities;
        if (Array.isArray(amenities)) {
            for (const a of amenities) {
                if (typeof a === "string" && a.trim()) amenitySet.add(a.trim());
            }
        }
    }

    const outHotel: Record<string, unknown> = {
        ...hotel,
        average_rating: averageRating,
        review_count: reviewCount,
        amenities: Array.from(amenitySet).sort((a, b) => a.localeCompare(b))
    };
    if (hotel.profile_image) {
        const url = await resolveHotelAssetUrl(hotel.profile_image);
        if (url) outHotel.profile_image_url = url;
    }
    if (hotel.cover_image) {
        const url = await resolveHotelAssetUrl(hotel.cover_image);
        if (url) outHotel.cover_image_url = url;
    }
    res.json({
        hotel: outHotel,
        rooms,
        total,
        page: pageClamped,
        limit,
        totalPages
    });
});

/** GET /api/rooms/:id — single room detail (for view room page; room must belong to verified hotel). */
router.get("/rooms/:id", async (req, res) => {
    const roomId = req.params.id;

    const { data: row, error: roomError } = await supabaseClient
        .from("rooms")
        .select(
            "*, hotels!inner(id, name, address, verification_status, currency, payment_qr_image, payment_account_name, payment_account_number, check_in_time, check_out_time, pets_policy, smoking_policy, cancellation_policy)"
        )
        .eq("id", roomId)
        .single();

    if (roomError || !row) {
        res.status(404).json({ error: "Room not found" });
        return;
    }

    const room = row as {
        hotels: {
            verification_status: string;
            name: string;
            address: string;
            payment_qr_image?: string | null;
            payment_account_name?: string | null;
            payment_account_number?: string | null;
        };
        hotel_id: string;
        media?: { type: string; path: string }[];
    };
    if (
        !room.hotels ||
        room.hotels.verification_status !== "verified" ||
        (room as unknown as { is_available?: boolean }).is_available === false
    ) {
        res.status(404).json({ error: "Room not found" });
        return;
    }

    const media = room.media ?? [];
    const mediaWithUrls: { type: string; path: string; url: string }[] = [];
    for (const item of media) {
        if (!item?.path) continue;
        const url = await resolveHotelAssetUrl(item.path);
        if (url) {
            mediaWithUrls.push({
                type: item.type || "image",
                path: item.path,
                url
            });
        }
    }

    const hotels = room.hotels as {
        name: string;
        address: string;
        payment_qr_image?: string | null;
        payment_account_name?: string | null;
        payment_account_number?: string | null;
        check_in_time?: string | null;
        check_out_time?: string | null;
        pets_policy?: string | null;
        smoking_policy?: string | null;
        cancellation_policy?: string | null;
    };
    const hotelPayload: {
        id: string;
        name: string;
        address: string;
        payment_qr_image_url?: string;
        payment_account_name?: string | null;
        payment_account_number?: string | null;
        payment_methods?: Array<{ id: string; label: string; qr_image_url?: string; account_name: string | null; account_number: string | null }>;
        check_in_time?: string | null;
        check_out_time?: string | null;
        pets_policy?: string | null;
        smoking_policy?: string | null;
        cancellation_policy?: string | null;
    } = {
        id: room.hotel_id,
        name: hotels.name,
        address: hotels.address,
        payment_account_name: hotels.payment_account_name ?? null,
        payment_account_number: hotels.payment_account_number ?? null,
        check_in_time: hotels.check_in_time ?? null,
        check_out_time: hotels.check_out_time ?? null,
        pets_policy: hotels.pets_policy ?? null,
        smoking_policy: hotels.smoking_policy ?? null,
        cancellation_policy: hotels.cancellation_policy ?? null
    };
    const { data: methodRows } = await supabaseAdmin
        .from("hotel_payment_methods")
        .select("id, label, qr_image_path, account_name, account_number, sort_order")
        .eq("hotel_id", room.hotel_id)
        .order("sort_order", { ascending: true });
    if (methodRows && methodRows.length > 0) {
        hotelPayload.payment_methods = [];
        for (const m of methodRows) {
            const row = m as { id: string; label: string; qr_image_path?: string | null; account_name?: string | null; account_number?: string | null };
            let qr_image_url: string | undefined;
            if (row.qr_image_path) {
                const { data: qrSigned } = await supabaseAdmin.storage
                    .from("hotel-assets")
                    .createSignedUrl(row.qr_image_path, 3600);
                if (qrSigned?.signedUrl) qr_image_url = qrSigned.signedUrl;
            }
            hotelPayload.payment_methods!.push({
                id: row.id,
                label: row.label,
                qr_image_url,
                account_name: row.account_name ?? null,
                account_number: row.account_number ?? null
            });
        }
    } else {
        if (hotels.payment_qr_image) {
            const { data: qrSigned } = await supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(hotels.payment_qr_image, 3600);
            if (qrSigned?.signedUrl) hotelPayload.payment_qr_image_url = qrSigned.signedUrl;
        }
    }

    const { hotels: _h, ...roomData } = room;

    // Room rating: aggregate reviews via bookings -> room_id
    let sum = 0;
    let count = 0;
    const comments: Array<{ rating: number; comment: string; created_at: string }> = [];
    const { reviews, relationMaps } = await getReviewAggregateContext();
    for (const review of reviews) {
        const rid = relationMaps.roomIdByBookingId.get(review.booking_id);
        if (rid !== roomId) continue;
        sum += review.rating;
        count += 1;
        if (typeof review.comment === "string" && review.comment.trim()) {
            comments.push({
                rating: review.rating,
                comment: review.comment.trim(),
                created_at: review.created_at
            });
        }
    }
    const averageRating = count > 0 ? sum / count : null;
    const reviewCount = count;
    comments.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    res.json({
        room: { ...roomData, media: mediaWithUrls },
        hotel: hotelPayload,
        rating: { average_rating: averageRating, review_count: reviewCount },
        reviews: comments.slice(0, 20)
    });
});

router.get("/rooms/:id/availability", async (req, res) => {
    const roomId = req.params.id;

    const { data, error } = await supabaseClient
        .from("room_availability")
        .select("date, available")
        .eq("room_id", roomId)
        .order("date", { ascending: true });

    if (error) {
        res.status(500).json({ error: "Failed to load availability" });
        return;
    }

    res.json(data);
});

/** GET /api/rooms/:id/hourly-slots?date=YYYY-MM-DD — available hours for hourly booking on a date (public). */
router.get("/rooms/:id/hourly-slots", async (req, res) => {
    const roomId = req.params.id;
    const date = req.query.date as string | undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: "Query 'date' required (YYYY-MM-DD)" });
        return;
    }

    const { data: room, error: roomError } = await supabaseClient
        .from("rooms")
        .select("id, hourly_available_hours, hotels!inner(verification_status)")
        .eq("id", roomId)
        .single();

    const hotels = room?.hotels as
        | { verification_status: string }
        | { verification_status: string }[]
        | undefined;
    const status = Array.isArray(hotels)
        ? hotels[0]?.verification_status
        : hotels?.verification_status;
    if (roomError || !room || status !== "verified") {
        res.status(404).json({ error: "Room not found" });
        return;
    }

    const { data: slots, error } = await supabaseClient
        .from("room_hourly_slots")
        .select("hour")
        .eq("room_id", roomId)
        .eq("date", date)
        .eq("available", true)
        .order("hour", { ascending: true });

    if (error) {
        res.status(500).json({ error: "Failed to load hourly slots" });
        return;
    }

    let hours = (slots ?? []).map((s) => Number(s.hour)).filter((h) => h >= 0 && h <= 23);
    if (
        hours.length === 0 &&
        room.hourly_available_hours &&
        Array.isArray(room.hourly_available_hours)
    ) {
        hours = (room.hourly_available_hours as number[]).filter((h) => h >= 0 && h <= 23);
    }

    const dateStart = `${date}T00:00:00.000Z`;
    const dateEnd = new Date(new Date(date).getTime() + 86400000).toISOString();
    const { data: existingBookings } = await supabaseAdmin
        .from("bookings")
        .select("hourly_hours")
        .eq("room_id", roomId)
        .eq("booking_type", "hourly")
        .in("status", ["pending", "confirmed"])
        .gte("check_in", dateStart)
        .lt("check_in", dateEnd);

    const takenSet = new Set<number>();
    for (const b of existingBookings ?? []) {
        const arr = b.hourly_hours as number[] | null;
        if (Array.isArray(arr)) {
            for (const h of arr) {
                if (Number.isInteger(h) && h >= 0 && h <= 23) takenSet.add(h);
            }
        }
    }
    hours = hours.filter((h) => !takenSet.has(h));
    res.json({ hours });
});

router.get("/me/hotel", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id, full_name")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    const { data: hotel, error: hotelError } = await db
        .from("hotels")
        .select("*")
        .eq("id", profile.hotel_id)
        .single();

    if (hotelError || !hotel) {
        res.status(404).json({ error: "Hotel not found" });
        return;
    }

    const out: Record<string, unknown> = { ...hotel };
    out.user_full_name = profile?.full_name ?? null;
    if (hotel.profile_image) {
        const { data: signed } = await supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.profile_image, 3600);
        if (signed?.signedUrl) out.profile_image_url = signed.signedUrl;
    }
    if (hotel.cover_image) {
        const { data: signed } = await supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.cover_image, 3600);
        if (signed?.signedUrl) out.cover_image_url = signed.signedUrl;
    }
    if (hotel.payment_qr_image) {
        const { data: signed } = await supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.payment_qr_image, 3600);
        if (signed?.signedUrl) out.payment_qr_image_url = signed.signedUrl;
    }
    const { data: methods } = await supabaseAdmin
        .from("hotel_payment_methods")
        .select("id, label, qr_image_path, account_name, account_number, sort_order")
        .eq("hotel_id", profile.hotel_id)
        .order("sort_order", { ascending: true });
    const paymentMethods: Array<{
        id: string;
        label: string;
        qr_image_url?: string;
        account_name: string | null;
        account_number: string | null;
        sort_order: number;
    }> = [];
    for (const m of methods ?? []) {
        const row = m as { id: string; label: string; qr_image_path?: string | null; account_name?: string | null; account_number?: string | null; sort_order?: number };
        let qr_image_url: string | undefined;
        if (row.qr_image_path) {
            const { data: signed } = await supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(row.qr_image_path, 3600);
            if (signed?.signedUrl) qr_image_url = signed.signedUrl;
        }
        paymentMethods.push({
            id: row.id,
            label: row.label,
            qr_image_url,
            account_name: row.account_name ?? null,
            account_number: row.account_number ?? null,
            sort_order: row.sort_order ?? 0
        });
    }
    out.payment_methods = paymentMethods;
    res.json(out);
});

/** PATCH /api/hotel/profile — update hotel profile details and policy fields. */
router.patch("/hotel/profile", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id, full_name")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    const {
        account_full_name,
        name,
        address,
        contact_email,
        contact_phone,
        description,
        bio,
        opening_hours,
        check_in_time,
        check_out_time,
        payment_account_name,
        payment_account_number,
        currency,
        pets_policy,
        smoking_policy,
        cancellation_policy
    } = req.body;
    const updates: Record<string, unknown> = {};
    const profileUpdates: Record<string, unknown> = {};
    let resolvedUserFullName: string | null = profile?.full_name ?? null;
    const { data: currentHotel, error: currentHotelError } = await supabaseAdmin
        .from("hotels")
        .select("name, permit_expires_at, hotel_name_edit_used")
        .eq("id", profile.hotel_id)
        .single();

    if (currentHotelError || !currentHotel) {
        res.status(404).json({ error: "Hotel not found" });
        return;
    }

    if (name !== undefined) {
        const nextName = typeof name === "string" ? name.trim() : "";
        const currentName = (currentHotel.name ?? "").trim();
        if (!nextName) {
            res.status(400).json({ error: "Hotel name is required" });
            return;
        }

        if (nextName !== currentName) {
            const permitExpiryRaw = currentHotel.permit_expires_at;
            const permitExpiresAt =
                typeof permitExpiryRaw === "string" && permitExpiryRaw
                    ? new Date(permitExpiryRaw)
                    : null;
            const permitExpired =
                permitExpiresAt instanceof Date &&
                !Number.isNaN(permitExpiresAt.getTime()) &&
                permitExpiresAt.getTime() < Date.now();

            if (!permitExpired) {
                res.status(403).json({
                    error: "Hotel name can only be edited when the legal document is expired."
                });
                return;
            }

            if (currentHotel.hotel_name_edit_used) {
                res.status(403).json({
                    error: "Hotel name can only be edited once per expiration and re-verification."
                });
                return;
            }

            updates.name = nextName;
            updates.hotel_name_edit_used = true;
            updates.verification_status = "pending";
        }
    }
    if (address !== undefined) {
        const nextAddress = address != null ? String(address).trim() : "";
        if (!nextAddress) {
            res.status(400).json({ error: "Address is required" });
            return;
        }
        updates.address = nextAddress;
    }
    if (contact_email !== undefined) {
        const nextContactEmail = contact_email != null ? String(contact_email).trim().toLowerCase() : "";
        if (!nextContactEmail) {
            res.status(400).json({ error: "Contact email is required" });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextContactEmail)) {
            res.status(400).json({ error: "Contact email is invalid" });
            return;
        }
        updates.contact_email = nextContactEmail;
    }
    if (contact_phone !== undefined)
        updates.contact_phone = contact_phone != null ? String(contact_phone).trim() || null : null;

    if (account_full_name !== undefined) {
        const nextAccountFullName =
            typeof account_full_name === "string" ? account_full_name.trim() : "";
        if (!nextAccountFullName) {
            res.status(400).json({ error: "Account name is required" });
            return;
        }
        profileUpdates.full_name = nextAccountFullName;
        resolvedUserFullName = nextAccountFullName;
    }
    if (description !== undefined) updates.description = description;
    if (bio !== undefined) updates.bio = bio;
    if (opening_hours !== undefined) updates.opening_hours = opening_hours ?? {};
    if (check_in_time !== undefined) updates.check_in_time = check_in_time || null;
    if (check_out_time !== undefined) updates.check_out_time = check_out_time || null;
    if (payment_account_name !== undefined)
        updates.payment_account_name = payment_account_name || null;
    if (payment_account_number !== undefined)
        updates.payment_account_number = payment_account_number || null;
    if (currency !== undefined) {
        const code = typeof currency === "string" ? currency.trim().toUpperCase() || "PHP" : "PHP";
        updates.currency = code;
    }
    if (pets_policy !== undefined) updates.pets_policy = pets_policy != null ? String(pets_policy).trim() || null : null;
    if (smoking_policy !== undefined) updates.smoking_policy = smoking_policy != null ? String(smoking_policy).trim() || null : null;
    if (cancellation_policy !== undefined) updates.cancellation_policy = cancellation_policy != null ? String(cancellation_policy).trim() || null : null;

    if (Object.keys(updates).length === 0 && Object.keys(profileUpdates).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
    }

    if (Object.keys(profileUpdates).length > 0) {
        const { error: profileUpdateError } = await supabaseAdmin
            .from("profiles")
            .update(profileUpdates)
            .eq("id", req.user!.sub);

        if (profileUpdateError) {
            res.status(500).json({ error: profileUpdateError.message ?? "Failed to update account name" });
            return;
        }
    }

    let hotel: unknown = null;
    if (Object.keys(updates).length > 0) {
        const hotelUpdate = await supabaseAdmin
            .from("hotels")
            .update(updates)
            .eq("id", profile.hotel_id)
            .select("*")
            .single();

        if (hotelUpdate.error) {
            res.status(500).json({ error: hotelUpdate.error.message ?? "Failed to update hotel profile" });
            return;
        }
        hotel = hotelUpdate.data;
    } else {
        const hotelFetch = await supabaseAdmin
            .from("hotels")
            .select("*")
            .eq("id", profile.hotel_id)
            .single();

        if (hotelFetch.error || !hotelFetch.data) {
            res.status(500).json({ error: hotelFetch.error?.message ?? "Failed to load hotel after update" });
            return;
        }
        hotel = hotelFetch.data;
    }

    res.json({
        ...(hotel as Record<string, unknown>),
        user_full_name: resolvedUserFullName
    });
});

/** POST /api/hotel/profile-image — upload hotel profile/avatar image. */
router.post(
    "/hotel/profile-image",
    authenticate,
    requireRole("hotel"),
    upload.single("profile_image"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({
                error: "Supabase session required (send x-supabase-access-token)"
            });
            return;
        }
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: "No file uploaded. Send profile_image." });
            return;
        }
        if (!file.mimetype?.startsWith("image/")) {
            res.status(400).json({ error: "File must be an image (JPEG, PNG, WebP, GIF)." });
            return;
        }

        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();

        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }

        const ext =
            file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
        const filePath = `profile-images/${profile.hotel_id}/avatar.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from("hotel-assets")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });

        if (uploadError) {
            res.status(500).json({ error: uploadError.message ?? "Failed to upload image" });
            return;
        }

        const { error: updateError } = await supabaseAdmin
            .from("hotels")
            .update({ profile_image: filePath })
            .eq("id", profile.hotel_id);

        if (updateError) {
            res.status(500).json({ error: "Failed to save profile image" });
            return;
        }
        res.json({ profile_image: filePath, message: "Profile image updated." });
    }
);

/** POST /api/hotel/cover-image — upload hotel cover/background image. */
router.post(
    "/hotel/cover-image",
    authenticate,
    requireRole("hotel"),
    upload.single("cover_image"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({
                error: "Supabase session required (send x-supabase-access-token)"
            });
            return;
        }
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: "No file uploaded. Send cover_image." });
            return;
        }
        if (!file.mimetype?.startsWith("image/")) {
            res.status(400).json({ error: "File must be an image (JPEG, PNG, WebP, GIF)." });
            return;
        }

        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();

        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }

        const ext =
            file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
        const filePath = `cover-images/${profile.hotel_id}/cover.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from("hotel-assets")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });

        if (uploadError) {
            res.status(500).json({ error: uploadError.message ?? "Failed to upload image" });
            return;
        }

        const { error: updateError } = await supabaseAdmin
            .from("hotels")
            .update({ cover_image: filePath })
            .eq("id", profile.hotel_id);

        if (updateError) {
            res.status(500).json({ error: "Failed to save cover image" });
            return;
        }
        res.json({ cover_image: filePath, message: "Cover image updated." });
    }
);

/** POST /api/hotel/payment-qr — upload payment QR code image for online payment. */
router.post(
    "/hotel/payment-qr",
    authenticate,
    requireRole("hotel"),
    upload.single("payment_qr_image"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({
                error: "Supabase session required (send x-supabase-access-token)"
            });
            return;
        }
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: "No file uploaded. Send payment_qr_image." });
            return;
        }
        if (!file.mimetype?.startsWith("image/")) {
            res.status(400).json({ error: "File must be an image (JPEG, PNG, WebP)." });
            return;
        }
        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();
        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }
        const ext =
            file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
        const filePath = `payment-qr/${profile.hotel_id}/qr.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from("hotel-assets")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
        if (uploadError) {
            res.status(500).json({ error: uploadError.message ?? "Failed to upload image" });
            return;
        }
        const { error: updateError } = await supabaseAdmin
            .from("hotels")
            .update({ payment_qr_image: filePath })
            .eq("id", profile.hotel_id);
        if (updateError) {
            res.status(500).json({ error: "Failed to save payment QR" });
            return;
        }
        res.json({ payment_qr_image: filePath, message: "Payment QR updated." });
    }
);

/** GET /api/hotel/payment-methods — list payment methods for the authenticated hotel. */
router.get("/hotel/payment-methods", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const { data: rows, error } = await supabaseAdmin
        .from("hotel_payment_methods")
        .select("id, label, qr_image_path, account_name, account_number, sort_order")
        .eq("hotel_id", profile.hotel_id)
        .order("sort_order", { ascending: true });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    const list: Array<{ id: string; label: string; qr_image_url?: string; account_name: string | null; account_number: string | null; sort_order: number }> = [];
    for (const row of rows ?? []) {
        const r = row as { id: string; label: string; qr_image_path?: string | null; account_name?: string | null; account_number?: string | null; sort_order?: number };
        let qr_image_url: string | undefined;
        if (r.qr_image_path) {
            const { data: signed } = await supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(r.qr_image_path, 3600);
            if (signed?.signedUrl) qr_image_url = signed.signedUrl;
        }
        list.push({
            id: r.id,
            label: r.label,
            qr_image_url,
            account_name: r.account_name ?? null,
            account_number: r.account_number ?? null,
            sort_order: r.sort_order ?? 0
        });
    }
    res.json({ payment_methods: list });
});

/** POST /api/hotel/payment-methods — add a payment method (label, account_name, account_number, qr_image file). */
router.post(
    "/hotel/payment-methods",
    authenticate,
    requireRole("hotel"),
    upload.single("qr_image"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
            return;
        }
        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();
        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }
        const { label, account_name, account_number } = req.body as { label?: string; account_name?: string; account_number?: string };
        const file = req.file;
        const ext = file?.mimetype === "image/png" ? "png" : file?.mimetype === "image/webp" ? "webp" : "jpg";
        const filePath = file
            ? `payment-methods/${profile.hotel_id}/${Date.now()}.${ext}`
            : null;
        if (file) {
            if (!file.mimetype?.startsWith("image/")) {
                res.status(400).json({ error: "QR image must be an image (JPEG, PNG, WebP)." });
                return;
            }
            const { error: uploadError } = await supabaseAdmin.storage
                .from("hotel-assets")
                .upload(filePath!, file.buffer, { contentType: file.mimetype, upsert: true });
            if (uploadError) {
                res.status(500).json({ error: uploadError.message ?? "Failed to upload image" });
                return;
            }
        }
        const { data: existing } = await supabaseAdmin
            .from("hotel_payment_methods")
            .select("sort_order")
            .eq("hotel_id", profile.hotel_id)
            .order("sort_order", { ascending: false })
            .limit(1)
            .single();
        const sort_order = (existing as { sort_order?: number } | null)?.sort_order ?? -1;
        const { data: inserted, error: insertError } = await supabaseAdmin
            .from("hotel_payment_methods")
            .insert({
                hotel_id: profile.hotel_id,
                label: (label ?? "").trim() || "Payment",
                qr_image_path: filePath,
                account_name: (account_name ?? "").trim() || null,
                account_number: (account_number ?? "").trim() || null,
                sort_order: sort_order + 1
            })
            .select("id, label, qr_image_path, account_name, account_number, sort_order")
            .single();
        if (insertError) {
            res.status(500).json({ error: insertError.message ?? "Failed to create payment method" });
            return;
        }
        const row = inserted as { id: string; label: string; qr_image_path?: string | null; account_name?: string | null; account_number?: string | null; sort_order?: number };
        let qr_image_url: string | undefined;
        if (row.qr_image_path) {
            const { data: signed } = await supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(row.qr_image_path, 3600);
            if (signed?.signedUrl) qr_image_url = signed.signedUrl;
        }
        res.status(201).json({
            id: row.id,
            label: row.label,
            qr_image_url,
            account_name: row.account_name ?? null,
            account_number: row.account_number ?? null,
            sort_order: row.sort_order ?? 0
        });
    }
);

/** PATCH /api/hotel/payment-methods/:id — update label, account_name, account_number; optional new qr_image. */
router.patch(
    "/hotel/payment-methods/:id",
    authenticate,
    requireRole("hotel"),
    upload.single("qr_image"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
            return;
        }
        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();
        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }
        const methodId = req.params.id;
        const { label, account_name, account_number } = req.body as { label?: string; account_name?: string; account_number?: string };
        const file = req.file;
        const updates: Record<string, unknown> = {};
        if (label !== undefined) updates.label = (label ?? "").trim() || "Payment";
        if (account_name !== undefined) updates.account_name = (account_name ?? "").trim() || null;
        if (account_number !== undefined) updates.account_number = (account_number ?? "").trim() || null;
        if (file?.mimetype?.startsWith("image/")) {
            const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
            const filePath = `payment-methods/${profile.hotel_id}/${methodId}.${ext}`;
            const { error: uploadError } = await supabaseAdmin.storage
                .from("hotel-assets")
                .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
            if (!uploadError) updates.qr_image_path = filePath;
        }
        if (Object.keys(updates).length === 0) {
            res.status(400).json({ error: "No fields to update" });
            return;
        }
        const { data: updated, error: updateError } = await supabaseAdmin
            .from("hotel_payment_methods")
            .update(updates)
            .eq("id", methodId)
            .eq("hotel_id", profile.hotel_id)
            .select("id, label, qr_image_path, account_name, account_number, sort_order")
            .single();
        if (updateError) {
            res.status(updateError.code === "PGRST116" ? 404 : 500).json({ error: updateError.message ?? "Failed to update" });
            return;
        }
        const row = updated as { id: string; label: string; qr_image_path?: string | null; account_name?: string | null; account_number?: string | null; sort_order?: number };
        let qr_image_url: string | undefined;
        if (row.qr_image_path) {
            const { data: signed } = await supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(row.qr_image_path, 3600);
            if (signed?.signedUrl) qr_image_url = signed.signedUrl;
        }
        res.json({
            id: row.id,
            label: row.label,
            qr_image_url,
            account_name: row.account_name ?? null,
            account_number: row.account_number ?? null,
            sort_order: row.sort_order ?? 0
        });
    }
);

/** DELETE /api/hotel/payment-methods/:id */
router.delete("/hotel/payment-methods/:id", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const { error } = await supabaseAdmin
        .from("hotel_payment_methods")
        .delete()
        .eq("id", req.params.id)
        .eq("hotel_id", profile.hotel_id);
    if (error) {
        res.status(error.code === "PGRST116" ? 404 : 500).json({ error: error.message ?? "Failed to delete" });
        return;
    }
    res.status(204).send();
});

/** POST /api/hotel/permit — upload business permit (legal document) for the authenticated hotel. */
router.post(
    "/hotel/permit",
    authenticate,
    requireRole("hotel"),
    upload.single("business_permit"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({
                error: "Supabase session required (send x-supabase-access-token)"
            });
            return;
        }
        const file = req.file;
        if (!file) {
            res.status(400).json({
                error: "No file uploaded. Send a business permit (PDF or image) as business_permit."
            });
            return;
        }

        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();

        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }

        const safeName = (file.originalname || "file").replace(/[^a-zA-Z0-9.-]/g, "_");
        const filePath = `business-permits/${Date.now()}-${safeName}`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from("hotel-assets")
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (uploadError) {
            console.error("[hotel/permit] Storage upload failed:", uploadError.message);
            res.status(500).json({ error: "Failed to upload file" });
            return;
        }

        const { error: updateError } = await supabaseAdmin
            .from("hotels")
            .update({ business_permit_file: uploadData?.path ?? filePath })
            .eq("id", profile.hotel_id);

        if (updateError) {
            res.status(500).json({ error: "Failed to save document" });
            return;
        }

        res.json({
            message: "Business permit submitted. An admin will review it for verification."
        });
    }
);

/** GET /api/hotel/permit-url — signed URL to view the authenticated hotel's legal document. */
router.get("/hotel/permit-url", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({
            error: "Supabase session required (send x-supabase-access-token)"
        });
        return;
    }

    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    const { data: hotel, error: hotelError } = await db
        .from("hotels")
        .select("business_permit_file")
        .eq("id", profile.hotel_id)
        .single();

    if (hotelError || !hotel?.business_permit_file) {
        res.status(404).json({ error: "No legal document on file" });
        return;
    }

    const { data: signed, error: signError } = await supabaseAdmin.storage
        .from("hotel-assets")
        .createSignedUrl(hotel.business_permit_file, 3600);

    if (signError || !signed?.signedUrl) {
        res.status(500).json({ error: "Could not generate document link" });
        return;
    }

    res.json({ url: signed.signedUrl });
});

router.get("/hotel/rooms", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    const { data, error } = await db
        .from("rooms")
        .select("*")
        .eq("hotel_id", profile.hotel_id)
        .order("created_at", { ascending: false });

    if (error) {
        res.status(500).json({ error: "Failed to load rooms" });
        return;
    }

    const rooms = data ?? [];
    for (const room of rooms) {
        if (room.media && Array.isArray(room.media) && room.media.length > 0) {
            room.media_urls = [];
            for (const item of room.media) {
                if (item?.path) {
                    const url = await resolveHotelAssetUrl(item.path);
                    if (url) {
                        room.media_urls.push({ type: item.type || "image", url });
                    }
                }
            }
        }
    }
    res.json(rooms);
});

/** GET /api/hotel/rooms/:id — fetch a single room for the authenticated hotel. */
router.get("/hotel/rooms/:id", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    const roomId = req.params.id;
    const { data, error } = await db
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .eq("hotel_id", profile.hotel_id)
        .single();

    if (error || !data) {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    const room = data as Record<string, unknown>;
    const media = (room.media as { type?: string; path: string }[] | null) ?? [];
    if (Array.isArray(media) && media.length > 0) {
        (room as Record<string, unknown>).media_urls = [];
        for (const item of media) {
            if (!item?.path) continue;
            const url = await resolveHotelAssetUrl(item.path);
            if (url) {
                (room as { media_urls: Array<{ type: string; url: string }> }).media_urls.push({
                    type: item.type || "image",
                    url
                });
            }
        }
    }
    res.json(room);
});

/** POST /api/hotel/rooms — create a room for the authenticated hotel. */
router.post("/hotel/rooms", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    const {
        name,
        room_type,
        base_price_night,
        hourly_rate,
        capacity,
        amenities,
        description,
        offer_hourly,
        is_available,
        media,
        bathroom_count,
        bathroom_shared,
        hourly_available_hours: hourlyAvailableHoursRaw,
        featured,
        pets_policy,
        smoking_policy,
        cancellation_policy,
        custom_policies
    } = req.body;
    if (!name || !room_type || base_price_night == null || !capacity) {
        res.status(400).json({
            error: "Missing required fields: name, room_type, base_price_night, capacity"
        });
        return;
    }
    const basePrice = Number(base_price_night);
    const cap = Number(capacity);
    const offerHourly = Boolean(offer_hourly);
    const hourly =
        offerHourly && hourly_rate != null && String(hourly_rate).trim() !== ""
            ? Number(hourly_rate)
            : null;
    if (Number.isNaN(basePrice) || basePrice < 0 || Number.isNaN(cap) || cap < 1) {
        res.status(400).json({ error: "base_price_night must be >= 0 and capacity must be >= 1" });
        return;
    }
    if (hourly != null && (Number.isNaN(hourly) || hourly < 0)) {
        res.status(400).json({ error: "hourly_rate must be >= 0 when provided" });
        return;
    }
    const bathroomCnt =
        bathroom_count != null && String(bathroom_count).trim() !== ""
            ? Number(bathroom_count)
            : null;
    if (bathroomCnt != null && (Number.isNaN(bathroomCnt) || bathroomCnt < 0)) {
        res.status(400).json({ error: "bathroom_count must be >= 0 when provided" });
        return;
    }
    const bathroomShared =
        bathroom_shared === undefined || bathroom_shared === null ? null : Boolean(bathroom_shared);
    const mediaArr = Array.isArray(media) ? media : [];
    if (mediaArr.length > 10) {
        res.status(400).json({ error: "Maximum 10 media items (images + 1 video)" });
        return;
    }
    const videoCount = mediaArr.filter((m: { type?: string }) => m?.type === "video").length;
    if (videoCount > 1) {
        res.status(400).json({ error: "Maximum 1 video allowed" });
        return;
    }

    const hourlyAvailableHours = normalizeHourlyAvailableHours(
        hourlyAvailableHoursRaw,
        offerHourly
    );

    const payload: Record<string, unknown> = {
        hotel_id: profile.hotel_id,
        name: String(name).trim(),
        room_type: String(room_type).trim(),
        base_price_night: basePrice,
        capacity: cap,
        offer_hourly: offerHourly,
        hourly_rate: hourly ?? null,
        is_available: is_available === undefined ? true : Boolean(is_available),
        hourly_available_hours: hourlyAvailableHours,
        amenities: Array.isArray(amenities) ? amenities : [],
        description: description != null ? String(description).trim() || null : null,
        media: mediaArr,
        bathroom_count: bathroomCnt,
        bathroom_shared: bathroomShared,
        featured: featured === undefined ? false : Boolean(featured),
        pets_policy: pets_policy != null ? String(pets_policy).trim() || null : null,
        smoking_policy: smoking_policy != null ? String(smoking_policy).trim() || null : null,
        cancellation_policy:
            cancellation_policy != null ? String(cancellation_policy).trim() || null : null,
        custom_policies: sanitizeCustomPolicies(custom_policies)
    };

    const { data, error } = await supabaseAdmin.from("rooms").insert(payload).select("*").single();

    if (error) {
        res.status(500).json({ error: error.message ?? "Failed to create room" });
        return;
    }
    res.status(201).json(data);
});

/** PATCH /api/hotel/rooms/:id — update a room (must belong to authenticated hotel). */
router.patch("/hotel/rooms/:id", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    const roomId = req.params.id;
    const {
        name,
        room_type,
        base_price_night,
        hourly_rate,
        capacity,
        amenities,
        description,
        offer_hourly,
        is_available,
        media,
        bathroom_count,
        bathroom_shared,
        hourly_available_hours: hourlyAvailableHoursRaw,
        featured,
        pets_policy,
        smoking_policy,
        cancellation_policy,
        custom_policies
    } = req.body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (room_type !== undefined) updates.room_type = String(room_type).trim();
    if (description !== undefined) updates.description = String(description).trim() || null;
    if (offer_hourly !== undefined) updates.offer_hourly = Boolean(offer_hourly);
    if (is_available !== undefined) updates.is_available = Boolean(is_available);
    if (base_price_night !== undefined) {
        const v = Number(base_price_night);
        if (Number.isNaN(v) || v < 0) {
            res.status(400).json({ error: "base_price_night must be >= 0" });
            return;
        }
        updates.base_price_night = v;
    }
    if (offer_hourly === false) {
        updates.hourly_rate = null;
        updates.hourly_available_hours = null;
    }
    if (hourly_rate !== undefined) {
        if (offer_hourly && hourly_rate != null && String(hourly_rate).trim() !== "") {
            const v = Number(hourly_rate);
            if (Number.isNaN(v) || v < 0) {
                res.status(400).json({ error: "hourly_rate must be >= 0" });
                return;
            }
            updates.hourly_rate = v;
        } else if (!offer_hourly) {
            updates.hourly_rate = null;
        }
    }
    if (hourlyAvailableHoursRaw !== undefined) {
        updates.hourly_available_hours = normalizeHourlyAvailableHours(
            hourlyAvailableHoursRaw,
            offer_hourly !== false
        );
    }
    if (capacity !== undefined) {
        const v = Number(capacity);
        if (Number.isNaN(v) || v < 1) {
            res.status(400).json({ error: "capacity must be >= 1" });
            return;
        }
        updates.capacity = v;
    }
    if (amenities !== undefined) updates.amenities = Array.isArray(amenities) ? amenities : [];
    if (bathroom_count !== undefined) {
        const v =
            bathroom_count == null || String(bathroom_count).trim() === ""
                ? null
                : Number(bathroom_count);
        if (v !== null && (Number.isNaN(v) || v < 0)) {
            res.status(400).json({ error: "bathroom_count must be >= 0" });
            return;
        }
        updates.bathroom_count = v;
    }
    if (bathroom_shared !== undefined) {
        updates.bathroom_shared = bathroom_shared === null ? null : Boolean(bathroom_shared);
    }
    if (media !== undefined) {
        const mediaArr = Array.isArray(media) ? media : [];
        if (mediaArr.length > 10) {
            res.status(400).json({ error: "Maximum 10 media items" });
            return;
        }
        if (mediaArr.filter((m: { type?: string }) => m?.type === "video").length > 1) {
            res.status(400).json({ error: "Maximum 1 video allowed" });
            return;
        }
        updates.media = mediaArr;
    }
    if (featured !== undefined) updates.featured = Boolean(featured);
    if (pets_policy !== undefined) updates.pets_policy = pets_policy != null ? String(pets_policy).trim() || null : null;
    if (smoking_policy !== undefined) updates.smoking_policy = smoking_policy != null ? String(smoking_policy).trim() || null : null;
    if (cancellation_policy !== undefined) updates.cancellation_policy = cancellation_policy != null ? String(cancellation_policy).trim() || null : null;
    if (custom_policies !== undefined)
        updates.custom_policies = sanitizeCustomPolicies(custom_policies);

    if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
    }

    const { data, error } = await supabaseAdmin
        .from("rooms")
        .update(updates)
        .eq("id", roomId)
        .eq("hotel_id", profile.hotel_id)
        .select("*")
        .single();

    if (error) {
        res.status(500).json({ error: error.message ?? "Failed to update room" });
        return;
    }
    if (!data) {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    res.json(data);
});

/** DELETE /api/hotel/rooms/:id — delete a room (must belong to authenticated hotel). */
router.delete("/hotel/rooms/:id", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    const { error } = await supabaseAdmin
        .from("rooms")
        .delete()
        .eq("id", req.params.id)
        .eq("hotel_id", profile.hotel_id);

    if (error) {
        res.status(500).json({ error: error.message ?? "Failed to delete room" });
        return;
    }
    res.status(204).send();
});

/** POST /api/hotel/rooms/:id/media — upload one image or video for a room (max 10 media, max 1 video). */
router.post(
    "/hotel/rooms/:id/media",
    authenticate,
    requireRole("hotel"),
    upload.single("media"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({
                error: "Supabase session required (send x-supabase-access-token)"
            });
            return;
        }
        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();

        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }

        const roomId = req.params.id;
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: "No file uploaded. Send 'media' (image or video)." });
            return;
        }

        const isVideo = file.mimetype?.startsWith("video/") ?? false;
        const isImage = file.mimetype?.startsWith("image/") ?? false;
        if (!isImage && !isVideo) {
            res.status(400).json({
                error: "File must be an image (JPEG, PNG, WebP, GIF) or video (MP4, WebM)."
            });
            return;
        }

        const { data: room, error: roomError } = await supabaseAdmin
            .from("rooms")
            .select("id, media")
            .eq("id", roomId)
            .eq("hotel_id", profile.hotel_id)
            .single();

        if (roomError || !room) {
            res.status(404).json({ error: "Room not found" });
            return;
        }

        const media = Array.isArray(room.media) ? room.media : [];
        if (media.length >= 10) {
            res.status(400).json({ error: "Maximum 10 media items per room." });
            return;
        }
        const hasVideo = media.some((m: { type?: string }) => m?.type === "video");
        if (isVideo && hasVideo) {
            res.status(400).json({ error: "Room already has a video. Maximum 1 video per room." });
            return;
        }

        const ext = isVideo
            ? file.mimetype?.includes("webm")
                ? "webm"
                : "mp4"
            : file.mimetype === "image/png"
              ? "png"
              : file.mimetype === "image/webp"
                ? "webp"
                : "jpg";
        const safeName = (file.originalname || "file").replace(/[^a-zA-Z0-9.-]/g, "_");
        const filePath = `room-media/${profile.hotel_id}/${roomId}/${Date.now()}-${safeName}.${ext}`;

        const MAX_VIDEO_SIZE_MB = 100;
        if (isVideo && file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
            res.status(400).json({
                error: `Video is too large. Maximum size is ${MAX_VIDEO_SIZE_MB}MB.`
            });
            return;
        }

        const { error: uploadError } = await supabaseAdmin.storage
            .from("hotel-assets")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

        if (uploadError) {
            const msg = uploadError.message ?? "Failed to upload file";
            const isSizeError = /exceeded|maximum.*size|too large/i.test(msg);
            res.status(isSizeError ? 400 : 500).json({
                error: isSizeError
                    ? `File is too large. Maximum size is ${MAX_VIDEO_SIZE_MB}MB for videos.`
                    : msg
            });
            return;
        }

        const newItem = { type: isVideo ? "video" : "image", path: filePath };
        const updatedMedia = [...media, newItem];

        const { data: updated, error: updateError } = await supabaseAdmin
            .from("rooms")
            .update({ media: updatedMedia })
            .eq("id", roomId)
            .eq("hotel_id", profile.hotel_id)
            .select("*")
            .single();

        if (updateError) {
            res.status(500).json({ error: updateError.message ?? "Failed to save media" });
            return;
        }
        res.status(201).json({ media: newItem, room: updated });
    }
);

router.get("/hotel/bookings", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    await autoMarkCompletedStaysForHotel(profile.hotel_id);

    const { data, error } = await db
        .from("bookings")
        .select("*, rooms!inner(name, hotel_id)")
        .eq("rooms.hotel_id", profile.hotel_id)
        .order("created_at", { ascending: false });

    if (error) {
        res.status(500).json({ error: "Failed to load hotel bookings" });
        return;
    }

    const bookings = (data ?? []) as Array<Record<string, unknown>>;
    const userIds = Array.from(
        new Set(bookings.map((b) => b.user_id).filter((id): id is string => typeof id === "string"))
    );

    const guestById = new Map<string, { email: string | null; full_name: string | null }>();
    if (userIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id, email, full_name")
            .in("id", userIds);
        for (const p of profiles ?? []) {
            guestById.set(p.id, {
                email: (p as { email?: string | null }).email ?? null,
                full_name: (p as { full_name?: string | null }).full_name ?? null
            });
        }
    }

    for (const b of bookings) {
        const uid = b.user_id as string | undefined;
        (b as Record<string, unknown>).guest = guestById.get(uid ?? "") ?? {
            email: null,
            full_name: null
        };
    }

    res.json(bookings);
});

/** GET /api/hotel/bookings/:id — single booking detail (must belong to hotel). */
router.get("/hotel/bookings/:id", authenticate, requireRole("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const bookingId = req.params.id;

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user!.sub)
        .single();

    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }

    const { data: booking, error } = await db
        .from("bookings")
        .select("*, rooms!inner(id, name, hotel_id)")
        .eq("id", bookingId)
        .single();

    if (error || !booking) {
        res.status(404).json({ error: "Booking not found" });
        return;
    }

    const roomsRaw = (booking as unknown as { rooms?: { hotel_id: string } | { hotel_id: string }[] }).rooms;
    const room = Array.isArray(roomsRaw) ? roomsRaw[0] : roomsRaw;
    if (!room || room.hotel_id !== profile.hotel_id) {
        res.status(404).json({ error: "Booking not found" });
        return;
    }

    const userId = (booking as { user_id: string }).user_id;
    const { data: guestProfile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", userId)
        .single();

    const guest = guestProfile
        ? { email: guestProfile.email ?? null, full_name: guestProfile.full_name ?? null }
        : { email: null, full_name: null };

    const out: Record<string, unknown> = { ...booking, guest };
    const receiptPath = (booking as { payment_receipt_path?: string | null }).payment_receipt_path;
    if (receiptPath) {
        const { data: signed } = await supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(receiptPath, 3600);
        if (signed?.signedUrl) out.payment_receipt_url = signed.signedUrl;
    }

    const payMethod = String((booking as { payment_method?: string | null }).payment_method ?? "")
        .toLowerCase()
        .trim();
    if (payMethod === "online" && room.hotel_id) {
        const pmId = (booking as { hotel_payment_method_id?: string | null }).hotel_payment_method_id;
        let online_payment_details: {
            source: "provider" | "legacy";
            label: string | null;
            account_name: string | null;
            account_number: string | null;
            qr_image_url?: string | null;
        } | null = null;

        if (pmId) {
            const { data: pm } = await supabaseAdmin
                .from("hotel_payment_methods")
                .select("label, account_name, account_number, hotel_id, qr_image_path")
                .eq("id", pmId)
                .single();
            const prow = pm as
                | {
                      label?: string | null;
                      account_name?: string | null;
                      account_number?: string | null;
                      hotel_id?: string;
                      qr_image_path?: string | null;
                  }
                | null;
            if (prow && prow.hotel_id === room.hotel_id) {
                let qr_image_url: string | null = null;
                if (prow.qr_image_path) {
                    const { data: signed } = await supabaseAdmin.storage
                        .from("hotel-assets")
                        .createSignedUrl(prow.qr_image_path, 3600);
                    qr_image_url = signed?.signedUrl ?? null;
                }
                online_payment_details = {
                    source: "provider",
                    label: prow.label ?? null,
                    account_name: prow.account_name ?? null,
                    account_number: prow.account_number ?? null,
                    qr_image_url,
                };
            }
        }

        if (!online_payment_details) {
            const { data: hrow } = await supabaseAdmin
                .from("hotels")
                .select("payment_account_name, payment_account_number, payment_qr_image")
                .eq("id", room.hotel_id)
                .single();
            const h = hrow as
                | {
                      payment_account_name?: string | null;
                      payment_account_number?: string | null;
                      payment_qr_image?: string | null;
                  }
                | null;
            if (h) {
                let qr_image_url: string | null = null;
                if (h.payment_qr_image) {
                    const { data: signed } = await supabaseAdmin.storage
                        .from("hotel-assets")
                        .createSignedUrl(h.payment_qr_image, 3600);
                    qr_image_url = signed?.signedUrl ?? null;
                }
                online_payment_details = {
                    source: "legacy",
                    label: "Default hotel account",
                    account_name: h.payment_account_name ?? null,
                    account_number: h.payment_account_number ?? null,
                    qr_image_url,
                };
            }
        }

        out.online_payment_details = online_payment_details;
    }

    res.json(out);
});

/** PATCH /api/hotel/bookings/:id/confirm — set status to confirmed. */
router.patch(
    "/hotel/bookings/:id/confirm",
    authenticate,
    requireRole("hotel"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({
                error: "Supabase session required (send x-supabase-access-token)"
            });
            return;
        }
        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const rawBid = req.params.id;
        const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
        if (!bookingId) {
            res.status(400).json({ error: "Invalid booking id" });
            return;
        }

        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();

        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }

        const { data: booking, error: fetchError } = await db
            .from("bookings")
            .select("id, status, rooms!inner(hotel_id)")
            .eq("id", bookingId)
            .single();

        if (fetchError || !booking) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        const room = (booking as unknown as { rooms?: { hotel_id: string } }).rooms;
        if (!room || room.hotel_id !== profile.hotel_id) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        if ((booking as { status: string }).status !== "pending") {
            res.status(400).json({ error: "Only pending bookings can be confirmed" });
            return;
        }

        const { data: updated, error: updateError } = await db
            .from("bookings")
            .update({ status: "confirmed" })
            .eq("id", bookingId)
            .select("*")
            .single();

        if (updateError) {
            res.status(500).json({ error: "Failed to confirm booking" });
            return;
        }
        try {
            const guestId = (updated as { user_id?: string }).user_id;
            if (guestId) notifyGuestBookingConfirmed(guestId, bookingId);
        } catch (e) {
            console.warn("[realtime] notifyGuestBookingConfirmed failed", e);
        }
        res.json(updated);
    }
);

/** PATCH /api/hotel/bookings/:id/decline — set status to cancelled and store reason. */
router.patch(
    "/hotel/bookings/:id/decline",
    authenticate,
    requireRole("hotel"),
    async (req, res) => {
        const rawBid = req.params.id;
        const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
        if (!bookingId) {
            res.status(400).json({ error: "Invalid booking id" });
            return;
        }
        const { reason } = req.body as { reason?: string };

        if (!reason || typeof reason !== "string" || !reason.trim()) {
            res.status(400).json({ error: "Reason for declining is required" });
            return;
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();

        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }

        const { data: booking, error: fetchError } = await supabaseAdmin
            .from("bookings")
            .select("id, status, room_id, user_id")
            .eq("id", bookingId)
            .single();

        if (fetchError || !booking) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        const { data: room } = await supabaseAdmin
            .from("rooms")
            .select("hotel_id")
            .eq("id", (booking as { room_id: string }).room_id)
            .single();

        if (!room || (room as { hotel_id: string }).hotel_id !== profile.hotel_id) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        if ((booking as { status: string }).status !== "pending") {
            res.status(400).json({ error: "Only pending bookings can be declined" });
            return;
        }

        const { data: updated, error: updateError } = await supabaseAdmin
            .from("bookings")
            .update({
                status: "cancelled",
                payment_status: "cancelled",
                decline_reason: reason.trim(),
            })
            .eq("id", bookingId)
            .select("*")
            .single();

        if (updateError) {
            res.status(500).json({ error: updateError.message ?? "Failed to decline booking" });
            return;
        }
        try {
            const guestId = (booking as { user_id?: string }).user_id;
            if (guestId) notifyGuestBookingDeclined(guestId, bookingId);
        } catch (e) {
            console.warn("[realtime] notifyGuestBookingDeclined failed", e);
        }
        res.json(updated);
    }
);

/** PATCH /api/hotel/bookings/:id/mark-paid — set payment_status to paid. */
router.patch(
    "/hotel/bookings/:id/mark-paid",
    authenticate,
    requireRole("hotel"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({
                error: "Supabase session required (send x-supabase-access-token)"
            });
            return;
        }
        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const rawBid = req.params.id;
        const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
        if (!bookingId) {
            res.status(400).json({ error: "Invalid booking id" });
            return;
        }

        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();

        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }

        const { data: booking, error: fetchError } = await db
            .from("bookings")
            .select("id, status, payment_status, payment_method, payment_receipt_path, rooms!inner(hotel_id)")
            .eq("id", bookingId)
            .single();

        if (fetchError || !booking) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        const room = (booking as unknown as { rooms?: { hotel_id: string } }).rooms;
        if (!room || room.hotel_id !== profile.hotel_id) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        const b = booking as {
            status: string;
            payment_status: string;
            payment_method?: string | null;
            payment_receipt_path?: string | null;
        };
        if (b.status !== "confirmed") {
            res.status(400).json({ error: "Only confirmed bookings can be marked as paid" });
            return;
        }
        if (b.payment_status !== "pending") {
            res.status(400).json({ error: "Payment is not awaiting verification" });
            return;
        }
        if (
            (b.payment_method ?? "").toLowerCase() === "online" &&
            !(b.payment_receipt_path && String(b.payment_receipt_path).trim())
        ) {
            res.status(400).json({
                error: "Guest must upload a payment receipt before you can approve online payment."
            });
            return;
        }

        const { data: updated, error: updateError } = await db
            .from("bookings")
            .update({ payment_status: "paid" })
            .eq("id", bookingId)
            .select("*")
            .single();

        if (updateError) {
            res.status(500).json({ error: "Failed to update payment status" });
            return;
        }
        try {
            const guestId = (updated as { user_id?: string }).user_id;
            if (guestId) notifyGuestPaymentApproved(guestId, bookingId);
        } catch (e) {
            console.warn("[realtime] notifyGuestPaymentApproved failed", e);
        }
        res.json(updated);
    }
);

/** PATCH /api/hotel/bookings/:id/reject-receipt — clear receipt so guest can upload new proof (confirmed, payment pending, online). */
router.patch(
    "/hotel/bookings/:id/reject-receipt",
    authenticate,
    requireRole("hotel"),
    async (req, res) => {
        if (!req.supabaseAccessToken) {
            res.status(401).json({
                error: "Supabase session required (send x-supabase-access-token)"
            });
            return;
        }
        const db = createSupabaseClientForUser(req.supabaseAccessToken);
        const rawBid = req.params.id;
        const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
        if (!bookingId) {
            res.status(400).json({ error: "Invalid booking id" });
            return;
        }
        const { note } = req.body as { note?: string };
        const noteTrimmed =
            typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : null;

        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("hotel_id")
            .eq("id", req.user!.sub)
            .single();

        if (profileError || !profile?.hotel_id) {
            res.status(404).json({ error: "No linked hotel found" });
            return;
        }

        const { data: booking, error: fetchError } = await db
            .from("bookings")
            .select("id, status, payment_status, payment_method, payment_receipt_path, rooms!inner(hotel_id)")
            .eq("id", bookingId)
            .single();

        if (fetchError || !booking) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        const room = (booking as unknown as { rooms?: { hotel_id: string } }).rooms;
        if (!room || room.hotel_id !== profile.hotel_id) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        const b = booking as {
            status: string;
            payment_status: string;
            payment_method?: string | null;
        };
        if (b.status !== "confirmed") {
            res.status(400).json({ error: "Only confirmed bookings can have payment proof rejected" });
            return;
        }
        if (b.payment_status !== "pending") {
            res.status(400).json({ error: "Payment is not awaiting verification" });
            return;
        }
        if ((b.payment_method ?? "").toLowerCase() !== "online") {
            res.status(400).json({ error: "This booking did not use online payment" });
            return;
        }

        const { data: updated, error: updateError } = await db
            .from("bookings")
            .update({
                payment_receipt_path: null,
                payment_rejection_note: noteTrimmed
            })
            .eq("id", bookingId)
            .select("*")
            .single();

        if (updateError) {
            res.status(500).json({ error: updateError.message ?? "Failed to reject receipt" });
            return;
        }
        try {
            const guestId = (updated as { user_id?: string }).user_id;
            if (guestId) notifyGuestReceiptRejected(guestId, bookingId);
        } catch (e) {
            console.warn("[realtime] notifyGuestReceiptRejected failed", e);
        }
        res.json(updated);
    }
);

export default router;
