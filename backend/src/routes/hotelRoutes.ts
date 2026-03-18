import { Router } from "express";
import multer from "multer";
import {
    supabaseAdmin,
    supabaseClient,
    createSupabaseClientForUser
} from "../config/supabaseClient";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

/** Normalize hourly_available_hours: array of 0-23, or null when not offering hourly. */
function normalizeHourlyAvailableHours(
    raw: unknown,
    offerHourly: boolean
): number[] | null {
    if (!offerHourly) return null;
    if (!raw) return null;
    const arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? (() => {
        try {
            return JSON.parse(raw) as unknown;
        } catch {
            return null;
        }
    })() : null);
    if (!Array.isArray(arr)) return null;
    const hours = arr
        .map((h) => (typeof h === "number" ? h : Number(h)))
        .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
    return [...new Set(hours)].sort((a, b) => a - b);
}

/** Handler for hotel registration (no auth required). */
async function handleHotelRegister(
    req: import("express").Request,
    res: import("express").Response
) {
    const { email, password, full_name, hotel_name, address, contact_email, latitude, longitude } =
        req.body;

    if (!email || !password || !hotel_name || !address || !contact_email) {
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

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role }
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
        message: "Hotel account created. Await admin verification before accessing dashboard."
    });
}

router.post("/register", upload.single("business_permit"), handleHotelRegister);
router.post("/hotels/register", upload.single("business_permit"), handleHotelRegister);

/** GET /api/hotels/top-rated — verified hotels with high average review rating (for landing page). */
router.get("/hotels/top-rated", async (_req, res) => {
    const { data: reviewsData, error: reviewsError } = await supabaseClient
        .from("reviews")
        .select(
            "rating, bookings(room_id, rooms(hotel_id, hotels(id, name, address, images, profile_image, verification_status, currency)))"
        );

    if (reviewsError) {
        res.status(500).json({ error: "Failed to load reviews" });
        return;
    }

    type Nested = {
        rating: number;
        bookings: {
            room_id: string;
            rooms: {
                hotel_id: string;
                hotels: {
                    id: string;
                    name: string;
                    address: string | null;
                    images: string[] | null;
                    profile_image: string | null;
                    verification_status: string;
                } | null;
            } | null;
        } | null;
    };
    const reviews = (reviewsData as unknown as Nested[]) ?? [];

    const byHotel = new Map<
        string,
        {
            hotel: { id: string; name: string; address: string | null; images: string[] | null; profile_image: string | null };
            ratings: number[];
        }
    >();

    for (const r of reviews) {
        const hotel = r.bookings?.rooms?.hotels;
        if (!hotel || hotel.verification_status !== "verified") continue;
        const entry = byHotel.get(hotel.id);
        if (!entry) {
            const h = hotel as { id: string; name: string; address: string | null; images: string[] | null; profile_image: string | null; currency?: string | null };
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

    // Add signed profile_image_url for each hotel
    for (const row of result) {
        const profileImage = (row as { profile_image?: string | null }).profile_image;
        if (profileImage) {
            const { data: signed } = await supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(profileImage, 3600);
            if (signed?.signedUrl) (row as Record<string, unknown>).profile_image_url = signed.signedUrl;
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
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : HOTELS_PAGE_SIZE;
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 50 ? limitRaw : HOTELS_PAGE_SIZE;

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
    const hotelIdSet = new Set(result.map((h) => h.id).filter((id): id is string => typeof id === "string"));
    if (hotelIdSet.size > 0) {
        const { data: reviewsData, error: reviewsError } = await supabaseClient
            .from("reviews")
            .select("rating, bookings(room_id, rooms(hotel_id))");

        if (!reviewsError) {
            const sumByHotel = new Map<string, { sum: number; count: number }>();
            for (const r of reviewsData ?? []) {
                const rating = Number((r as { rating?: unknown }).rating);
                if (!Number.isFinite(rating)) continue;
                const hid = (r as { bookings?: { rooms?: { hotel_id?: unknown } } }).bookings?.rooms?.hotel_id;
                if (typeof hid !== "string" || !hotelIdSet.has(hid)) continue;
                const cur = sumByHotel.get(hid) ?? { sum: 0, count: 0 };
                cur.sum += rating;
                cur.count += 1;
                sumByHotel.set(hid, cur);
            }
            for (const h of result) {
                const hid = h.id as string | undefined;
                if (!hid) continue;
                const agg = sumByHotel.get(hid);
                (h as Record<string, unknown>).review_count = agg?.count ?? 0;
                (h as Record<string, unknown>).average_rating =
                    agg && agg.count > 0 ? agg.sum / agg.count : null;
            }
        } else {
            for (const h of result) {
                (h as Record<string, unknown>).review_count = 0;
                (h as Record<string, unknown>).average_rating = null;
            }
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
                if (signed?.signedUrl) (row as Record<string, unknown>).profile_image_url = signed.signedUrl;
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

    const { data: roomsRaw, error: roomsError } = await supabaseClient
        .from("rooms")
        .select("*")
        .eq("hotel_id", hotelId)
        .eq("is_available", true)
        .order("base_price_night", { ascending: true });

    if (roomsError) {
        res.status(500).json({ error: "Failed to load rooms" });
        return;
    }

    const rooms: Record<string, unknown>[] = [];
    for (const room of roomsRaw ?? []) {
        const r = { ...room } as Record<string, unknown>;
        const media = (room.media as { type?: string; path: string }[] | null) ?? [];
        const firstImage = media.find((m) => m?.path && (m.type === "image" || !m.type));
        if (firstImage?.path) {
            const { data: signed } = await supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(firstImage.path, 3600);
            if (signed?.signedUrl) r.main_image_url = signed.signedUrl;
        }
        rooms.push(r);
    }

    const outHotel: Record<string, unknown> = { ...hotel };
    if (hotel.profile_image) {
        const { data: signed } = await supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.profile_image, 3600);
        if (signed?.signedUrl) outHotel.profile_image_url = signed.signedUrl;
    }
    if (hotel.cover_image) {
        const { data: signed } = await supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.cover_image, 3600);
        if (signed?.signedUrl) outHotel.cover_image_url = signed.signedUrl;
    }
    res.json({ hotel: outHotel, rooms });
});

/** GET /api/rooms/:id — single room detail (for view room page; room must belong to verified hotel). */
router.get("/rooms/:id", async (req, res) => {
    const roomId = req.params.id;

    const { data: row, error: roomError } = await supabaseClient
        .from("rooms")
        .select(
            "*, hotels!inner(id, name, address, verification_status, currency, payment_qr_image, payment_account_name, payment_account_number)"
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
        const { data: signed } = await supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(item.path, 3600);
        if (signed?.signedUrl) {
            mediaWithUrls.push({
                type: item.type || "image",
                path: item.path,
                url: signed.signedUrl
            });
        }
    }

    const hotels = room.hotels;
    const hotelPayload: {
        id: string;
        name: string;
        address: string;
        payment_qr_image_url?: string;
        payment_account_name?: string | null;
        payment_account_number?: string | null;
    } = {
        id: room.hotel_id,
        name: hotels.name,
        address: hotels.address,
        payment_account_name: hotels.payment_account_name ?? null,
        payment_account_number: hotels.payment_account_number ?? null
    };
    if (hotels.payment_qr_image) {
        const { data: qrSigned } = await supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotels.payment_qr_image, 3600);
        if (qrSigned?.signedUrl) hotelPayload.payment_qr_image_url = qrSigned.signedUrl;
    }

    const { hotels: _h, ...roomData } = room;
    res.json({
        room: { ...roomData, media: mediaWithUrls },
        hotel: hotelPayload
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

    const hotels = room?.hotels as { verification_status: string } | { verification_status: string }[] | undefined;
    const status = Array.isArray(hotels) ? hotels[0]?.verification_status : hotels?.verification_status;
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
    if (hours.length === 0 && room.hourly_available_hours && Array.isArray(room.hourly_available_hours)) {
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
        .select("hotel_id")
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
    res.json(out);
});

/** PATCH /api/hotel/profile — update bio, description, opening_hours, check_in_time, check_out_time. */
router.patch("/hotel/profile", authenticate, requireRole("hotel"), async (req, res) => {
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
        description,
        bio,
        opening_hours,
        check_in_time,
        check_out_time,
        payment_account_name,
        payment_account_number,
        currency
    } = req.body;
    const updates: Record<string, unknown> = {};
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

    if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
    }

    const { data: hotel, error: updateError } = await supabaseAdmin
        .from("hotels")
        .update(updates)
        .eq("id", profile.hotel_id)
        .select("*")
        .single();

    if (updateError) {
        res.status(500).json({ error: updateError.message ?? "Failed to update profile" });
        return;
    }
    res.json(hotel);
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
                    const { data: signed } = await supabaseAdmin.storage
                        .from("hotel-assets")
                        .createSignedUrl(item.path, 3600);
                    if (signed?.signedUrl) {
                        room.media_urls.push({ type: item.type || "image", url: signed.signedUrl });
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
            const { data: signed } = await supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(item.path, 3600);
            if (signed?.signedUrl) {
                (room as { media_urls: Array<{ type: string; url: string }> }).media_urls.push({
                    type: item.type || "image",
                    url: signed.signedUrl
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
        hourly_available_hours: hourlyAvailableHoursRaw
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

    const hourlyAvailableHours = normalizeHourlyAvailableHours(hourlyAvailableHoursRaw, offerHourly);

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
        bathroom_shared: bathroomShared
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
        hourly_available_hours: hourlyAvailableHoursRaw
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

    const room = (booking as unknown as { rooms?: { hotel_id: string } }).rooms;
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

    res.json(out);
});

/** PATCH /api/hotel/bookings/:id/confirm — set status to confirmed. */
router.patch("/hotel/bookings/:id/confirm", authenticate, requireRole("hotel"), async (req, res) => {
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
    res.json(updated);
});

/** PATCH /api/hotel/bookings/:id/decline — set status to cancelled and store reason. */
router.patch("/hotel/bookings/:id/decline", authenticate, requireRole("hotel"), async (req, res) => {
    const bookingId = req.params.id;
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
        .select("id, status, room_id")
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
        .update({ status: "cancelled", decline_reason: reason.trim() })
        .eq("id", bookingId)
        .select("*")
        .single();

    if (updateError) {
        res.status(500).json({ error: updateError.message ?? "Failed to decline booking" });
        return;
    }
    res.json(updated);
});

/** PATCH /api/hotel/bookings/:id/mark-paid — set payment_status to paid. */
router.patch("/hotel/bookings/:id/mark-paid", authenticate, requireRole("hotel"), async (req, res) => {
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

    const { data: booking, error: fetchError } = await db
        .from("bookings")
        .select("id, payment_status, rooms!inner(hotel_id)")
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
    res.json(updated);
});

export default router;
