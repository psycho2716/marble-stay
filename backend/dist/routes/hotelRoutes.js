"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const supabaseClient_1 = require("../config/supabaseClient");
const auth_1 = require("../middleware/auth");
const realtime_1 = require("../realtime");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
/**
 * Mark confirmed + paid bookings as `completed` once check-out has passed.
 * Used before hotel booking lists so revenue and status stay accurate.
 */
async function autoMarkCompletedStaysForHotel(hotelId) {
    const { data: hotelRooms, error: roomsErr } = await supabaseClient_1.supabaseAdmin
        .from("rooms")
        .select("id")
        .eq("hotel_id", hotelId);
    if (roomsErr || !hotelRooms?.length)
        return;
    const roomIds = hotelRooms.map((r) => r.id);
    const nowIso = new Date().toISOString();
    const { data: eligible, error: elErr } = await supabaseClient_1.supabaseAdmin
        .from("bookings")
        .select("id")
        .in("room_id", roomIds)
        .eq("status", "confirmed")
        .eq("payment_status", "paid")
        .lt("check_out", nowIso);
    if (elErr || !eligible?.length)
        return;
    const ids = eligible.map((row) => row.id);
    const { error: upErr } = await supabaseClient_1.supabaseAdmin
        .from("bookings")
        .update({ status: "completed" })
        .in("id", ids);
    if (upErr) {
        console.warn("[hotel/bookings] autoMarkCompletedStaysForHotel:", upErr.message);
    }
}
/** Normalize hourly_available_hours: array of 0-23, or null when not offering hourly. */
function normalizeHourlyAvailableHours(raw, offerHourly) {
    if (!offerHourly)
        return null;
    if (!raw)
        return null;
    const arr = Array.isArray(raw)
        ? raw
        : typeof raw === "string"
            ? (() => {
                try {
                    return JSON.parse(raw);
                }
                catch {
                    return null;
                }
            })()
            : null;
    if (!Array.isArray(arr))
        return null;
    const hours = arr
        .map((h) => (typeof h === "number" ? h : Number(h)))
        .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
    return [...new Set(hours)].sort((a, b) => a - b);
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
];
function sanitizeCustomPolicies(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw.slice(0, 10)) {
        if (!item || typeof item !== "object")
            continue;
        const obj = item;
        const iconKeyRaw = (typeof obj.iconKey === "string" && obj.iconKey) ||
            (typeof obj.icon_key === "string" && obj.icon_key) ||
            (typeof obj.icon === "string" && obj.icon) ||
            "";
        const iconKey = iconKeyRaw;
        if (!ALLOWED_CUSTOM_POLICY_ICON_KEYS.includes(iconKey))
            continue;
        const label = typeof obj.label === "string" ? obj.label.trim() : "";
        const value = typeof obj.value === "string" ? obj.value.trim() : "";
        // Only show if both label + value are present.
        if (!label || !value)
            continue;
        out.push({ iconKey, label, value });
    }
    return out;
}
/** Handler for hotel registration (no auth required). */
async function handleHotelRegister(req, res) {
    const { email, password, full_name, hotel_name, address, contact_email, latitude, longitude } = req.body;
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
    let businessPermitUrl = null;
    if (file) {
        const safeName = (file.originalname || "file").replace(/[^a-zA-Z0-9.-]/g, "_");
        const filePath = `business-permits/${Date.now()}-${safeName}`;
        const { data, error } = await supabaseClient_1.supabaseAdmin.storage
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
    const { data: userData, error: userError } = await supabaseClient_1.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role }
    });
    if (userError || !userData.user) {
        res.status(400).json({ error: userError?.message ?? "Unable to register hotel" });
        return;
    }
    const { data: hotelData, error: hotelError } = await supabaseClient_1.supabaseAdmin
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
    await supabaseClient_1.supabaseAdmin
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
    const { data: reviewsData, error: reviewsError } = await supabaseClient_1.supabaseClient
        .from("reviews")
        .select("rating, bookings(room_id, rooms(hotel_id, hotels(id, name, address, images, profile_image, verification_status, currency)))");
    if (reviewsError) {
        res.status(500).json({ error: "Failed to load reviews" });
        return;
    }
    const reviews = reviewsData ?? [];
    const byHotel = new Map();
    for (const r of reviews) {
        const hotel = r.bookings?.rooms?.hotels;
        if (!hotel || hotel.verification_status !== "verified")
            continue;
        const entry = byHotel.get(hotel.id);
        if (!entry) {
            const h = hotel;
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
        }
        else {
            entry.ratings.push(r.rating);
        }
    }
    let result = Array.from(byHotel.entries())
        .map(([, v]) => ({
        ...v.hotel,
        average_rating: v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length,
        review_count: v.ratings.length
    }))
        .sort((a, b) => b.average_rating - a.average_rating)
        .slice(0, 6);
    if (result.length === 0) {
        const { data: fallback } = await supabaseClient_1.supabaseClient
            .from("hotels")
            .select("id, name, address, images, profile_image, currency")
            .eq("verification_status", "verified")
            .order("created_at", { ascending: false })
            .limit(6);
        result = (fallback ?? []).map((h) => ({
            ...h,
            address: h.address ?? null,
            images: h.images ?? null,
            profile_image: h.profile_image ?? null,
            currency: h.currency ?? "PHP",
            average_rating: 0,
            review_count: 0
        }));
    }
    // Add signed profile_image_url for each hotel
    for (const row of result) {
        const profileImage = row.profile_image;
        if (profileImage) {
            const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(profileImage, 3600);
            if (signed?.signedUrl)
                row.profile_image_url = signed.signedUrl;
        }
    }
    res.json(result);
});
const HOTELS_PAGE_SIZE = 8;
router.get("/hotels", async (req, res) => {
    const minPriceQ = typeof req.query.minPrice === "string" ? Number(req.query.minPrice) : null;
    const maxPriceQ = typeof req.query.maxPrice === "string" ? Number(req.query.maxPrice) : null;
    const ratingMinQ = typeof req.query.rating === "string" ? Number(req.query.rating) : null;
    const amenitiesQ = typeof req.query.amenities === "string"
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
    const minPrice = Number.isFinite(minPriceQ) ? minPriceQ : null;
    const maxPrice = Number.isFinite(maxPriceQ) ? maxPriceQ : null;
    const ratingMin = Number.isFinite(ratingMinQ) ? ratingMinQ : null;
    const { data: hotelsRaw, error: hotelsError } = await supabaseClient_1.supabaseClient
        .from("hotels")
        .select("*")
        .eq("verification_status", "verified")
        .order("created_at", { ascending: false });
    if (hotelsError) {
        res.status(500).json({ error: "Failed to load hotels" });
        return;
    }
    let hotels = (hotelsRaw ?? []);
    if (locationQ) {
        const needle = locationQ.toLowerCase();
        hotels = hotels.filter((h) => {
            const addr = (h.address ?? "");
            return typeof addr === "string" && addr.toLowerCase().includes(needle);
        });
    }
    const hotelIds = hotels.map((h) => h.id).filter((id) => typeof id === "string");
    // Load rooms for pricing + amenities filtering (published rooms = available rooms on verified hotels)
    const { data: roomsRaw, error: roomsError } = await supabaseClient_1.supabaseClient
        .from("rooms")
        .select("hotel_id, base_price_night, amenities")
        .in("hotel_id", hotelIds)
        .eq("is_available", true);
    if (roomsError) {
        res.status(500).json({ error: "Failed to load hotel rooms for filtering" });
        return;
    }
    const roomsByHotel = new Map();
    for (const r of roomsRaw ?? []) {
        const hid = r.hotel_id;
        if (typeof hid !== "string")
            continue;
        const priceRaw = r.base_price_night;
        const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
        const amenities = Array.isArray(r.amenities)
            ? r.amenities.filter((a) => typeof a === "string" && a.trim().length > 0)
            : [];
        const entry = roomsByHotel.get(hid) ?? [];
        entry.push({ price: Number.isFinite(price) ? price : null, amenities });
        roomsByHotel.set(hid, entry);
    }
    const result = [];
    for (const h of hotels) {
        const hid = h.id;
        if (!hid)
            continue;
        // rating filter (if available)
        if (ratingMin != null) {
            const r = Number(h.average_rating ?? 0);
            if (!Number.isFinite(r) || r < ratingMin)
                continue;
        }
        const rooms = roomsByHotel.get(hid) ?? [];
        if (rooms.length === 0)
            continue;
        // Apply room-level filters (price + amenities) and ensure at least one room matches.
        const matches = rooms.filter((room) => {
            const price = room.price;
            if (minPrice != null && price != null && price < minPrice)
                return false;
            if (maxPrice != null && price != null && price > maxPrice)
                return false;
            if (amenitiesQ.length > 0) {
                const set = new Set(room.amenities.map((a) => a.toLowerCase()));
                for (const a of amenitiesQ) {
                    if (!set.has(a.toLowerCase()))
                        return false;
                }
            }
            return true;
        });
        if (matches.length === 0)
            continue;
        const minRoomPrice = matches
            .map((m) => m.price)
            .filter((p) => typeof p === "number" && Number.isFinite(p))
            .sort((a, b) => a - b)[0];
        const out = { ...h };
        if (minRoomPrice != null)
            out.min_price = String(minRoomPrice);
        result.push(out);
    }
    // Attach average_rating / review_count (same source as /hotels/top-rated).
    const hotelIdSet = new Set(result.map((h) => h.id).filter((id) => typeof id === "string"));
    if (hotelIdSet.size > 0) {
        const { data: reviewsData, error: reviewsError } = await supabaseClient_1.supabaseClient
            .from("reviews")
            .select("rating, bookings(room_id, rooms(hotel_id))");
        if (!reviewsError) {
            const sumByHotel = new Map();
            for (const r of reviewsData ?? []) {
                const rating = Number(r.rating);
                if (!Number.isFinite(rating))
                    continue;
                const hid = r.bookings?.rooms
                    ?.hotel_id;
                if (typeof hid !== "string" || !hotelIdSet.has(hid))
                    continue;
                const cur = sumByHotel.get(hid) ?? { sum: 0, count: 0 };
                cur.sum += rating;
                cur.count += 1;
                sumByHotel.set(hid, cur);
            }
            for (const h of result) {
                const hid = h.id;
                if (!hid)
                    continue;
                const agg = sumByHotel.get(hid);
                h.review_count = agg?.count ?? 0;
                h.average_rating =
                    agg && agg.count > 0 ? agg.sum / agg.count : null;
            }
        }
        else {
            for (const h of result) {
                h.review_count = 0;
                h.average_rating = null;
            }
        }
    }
    // Add signed profile_image_url for each hotel (when present)
    for (const row of result) {
        const profileImage = row.profile_image;
        if (profileImage) {
            if (/^https?:\/\//i.test(profileImage)) {
                row.profile_image_url = profileImage;
            }
            else {
                const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
                    .from("hotel-assets")
                    .createSignedUrl(profileImage, 3600);
                if (signed?.signedUrl)
                    row.profile_image_url = signed.signedUrl;
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
    const { data, error } = await supabaseClient_1.supabaseClient
        .from("rooms")
        .select("base_price_night, amenities, hotels!inner(verification_status)")
        .eq("is_available", true)
        .eq("hotels.verification_status", "verified");
    if (error) {
        res.status(500).json({ error: "Failed to load hotel filters" });
        return;
    }
    let minPrice = null;
    let maxPrice = null;
    const amenitySet = new Set();
    for (const row of data ?? []) {
        const priceRaw = row.base_price_night;
        const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
        if (Number.isFinite(price)) {
            minPrice = minPrice == null ? price : Math.min(minPrice, price);
            maxPrice = maxPrice == null ? price : Math.max(maxPrice, price);
        }
        const amenities = row.amenities;
        if (Array.isArray(amenities)) {
            for (const a of amenities) {
                if (typeof a === "string" && a.trim())
                    amenitySet.add(a.trim());
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
    const { data: hotel, error: hotelError } = await supabaseClient_1.supabaseClient
        .from("hotels")
        .select("*")
        .eq("id", hotelId)
        .eq("verification_status", "verified")
        .single();
    if (hotelError || !hotel) {
        res.status(404).json({ error: "Hotel not found" });
        return;
    }
    const { count: totalRooms, error: countError } = await supabaseClient_1.supabaseClient
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
    const { data: roomsRaw, error: roomsError } = await supabaseClient_1.supabaseClient
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
    const rooms = [];
    for (const room of roomsRaw ?? []) {
        const r = { ...room };
        const media = room.media ?? [];
        const firstImage = media.find((m) => m?.path && (m.type === "image" || !m.type));
        if (firstImage?.path) {
            const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(firstImage.path, 3600);
            if (signed?.signedUrl)
                r.main_image_url = signed.signedUrl;
        }
        rooms.push(r);
    }
    const { data: reviewsData } = await supabaseClient_1.supabaseClient
        .from("reviews")
        .select("rating, bookings(room_id, rooms(hotel_id))");
    const sumByHotel = new Map();
    for (const r of reviewsData ?? []) {
        const rating = Number(r.rating);
        if (!Number.isFinite(rating))
            continue;
        const hid = r.bookings?.rooms
            ?.hotel_id;
        if (typeof hid !== "string" || hid !== hotelId)
            continue;
        const cur = sumByHotel.get(hotelId) ?? { sum: 0, count: 0 };
        cur.sum += rating;
        cur.count += 1;
        sumByHotel.set(hotelId, cur);
    }
    const agg = sumByHotel.get(hotelId);
    const reviewCount = agg?.count ?? 0;
    const averageRating = agg && agg.count > 0 ? agg.sum / agg.count : null;
    const { data: allRoomsForAmenities } = await supabaseClient_1.supabaseClient
        .from("rooms")
        .select("amenities")
        .eq("hotel_id", hotelId)
        .eq("is_available", true);
    const amenitySet = new Set();
    for (const row of allRoomsForAmenities ?? []) {
        const amenities = row.amenities;
        if (Array.isArray(amenities)) {
            for (const a of amenities) {
                if (typeof a === "string" && a.trim())
                    amenitySet.add(a.trim());
            }
        }
    }
    const outHotel = {
        ...hotel,
        average_rating: averageRating,
        review_count: reviewCount,
        amenities: Array.from(amenitySet).sort((a, b) => a.localeCompare(b))
    };
    if (hotel.profile_image) {
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.profile_image, 3600);
        if (signed?.signedUrl)
            outHotel.profile_image_url = signed.signedUrl;
    }
    if (hotel.cover_image) {
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.cover_image, 3600);
        if (signed?.signedUrl)
            outHotel.cover_image_url = signed.signedUrl;
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
    const { data: row, error: roomError } = await supabaseClient_1.supabaseClient
        .from("rooms")
        .select("*, hotels!inner(id, name, address, verification_status, currency, payment_qr_image, payment_account_name, payment_account_number, check_in_time, check_out_time, pets_policy, smoking_policy, cancellation_policy)")
        .eq("id", roomId)
        .single();
    if (roomError || !row) {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    const room = row;
    if (!room.hotels ||
        room.hotels.verification_status !== "verified" ||
        room.is_available === false) {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    const media = room.media ?? [];
    const mediaWithUrls = [];
    for (const item of media) {
        if (!item?.path)
            continue;
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
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
    const hotelPayload = {
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
    const { data: methodRows } = await supabaseClient_1.supabaseAdmin
        .from("hotel_payment_methods")
        .select("id, label, qr_image_path, account_name, account_number, sort_order")
        .eq("hotel_id", room.hotel_id)
        .order("sort_order", { ascending: true });
    if (methodRows && methodRows.length > 0) {
        hotelPayload.payment_methods = [];
        for (const m of methodRows) {
            const row = m;
            let qr_image_url;
            if (row.qr_image_path) {
                const { data: qrSigned } = await supabaseClient_1.supabaseAdmin.storage
                    .from("hotel-assets")
                    .createSignedUrl(row.qr_image_path, 3600);
                if (qrSigned?.signedUrl)
                    qr_image_url = qrSigned.signedUrl;
            }
            hotelPayload.payment_methods.push({
                id: row.id,
                label: row.label,
                qr_image_url,
                account_name: row.account_name ?? null,
                account_number: row.account_number ?? null
            });
        }
    }
    else {
        if (hotels.payment_qr_image) {
            const { data: qrSigned } = await supabaseClient_1.supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(hotels.payment_qr_image, 3600);
            if (qrSigned?.signedUrl)
                hotelPayload.payment_qr_image_url = qrSigned.signedUrl;
        }
    }
    const { hotels: _h, ...roomData } = room;
    // Room rating: aggregate reviews via bookings -> room_id
    const { data: reviewsData } = await supabaseClient_1.supabaseClient
        .from("reviews")
        .select("rating, bookings(room_id)")
        .limit(500);
    let sum = 0;
    let count = 0;
    for (const r of reviewsData ?? []) {
        const rid = r?.bookings?.room_id ??
            (Array.isArray(r?.bookings) ? r?.bookings?.[0]?.room_id : null);
        if (rid !== roomId)
            continue;
        const rating = Number(r.rating);
        if (!Number.isFinite(rating))
            continue;
        sum += rating;
        count += 1;
    }
    const averageRating = count > 0 ? sum / count : null;
    const reviewCount = count;
    res.json({
        room: { ...roomData, media: mediaWithUrls },
        hotel: hotelPayload,
        rating: { average_rating: averageRating, review_count: reviewCount }
    });
});
router.get("/rooms/:id/availability", async (req, res) => {
    const roomId = req.params.id;
    const { data, error } = await supabaseClient_1.supabaseClient
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
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: "Query 'date' required (YYYY-MM-DD)" });
        return;
    }
    const { data: room, error: roomError } = await supabaseClient_1.supabaseClient
        .from("rooms")
        .select("id, hourly_available_hours, hotels!inner(verification_status)")
        .eq("id", roomId)
        .single();
    const hotels = room?.hotels;
    const status = Array.isArray(hotels)
        ? hotels[0]?.verification_status
        : hotels?.verification_status;
    if (roomError || !room || status !== "verified") {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    const { data: slots, error } = await supabaseClient_1.supabaseClient
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
    if (hours.length === 0 &&
        room.hourly_available_hours &&
        Array.isArray(room.hourly_available_hours)) {
        hours = room.hourly_available_hours.filter((h) => h >= 0 && h <= 23);
    }
    const dateStart = `${date}T00:00:00.000Z`;
    const dateEnd = new Date(new Date(date).getTime() + 86400000).toISOString();
    const { data: existingBookings } = await supabaseClient_1.supabaseAdmin
        .from("bookings")
        .select("hourly_hours")
        .eq("room_id", roomId)
        .eq("booking_type", "hourly")
        .in("status", ["pending", "confirmed"])
        .gte("check_in", dateStart)
        .lt("check_in", dateEnd);
    const takenSet = new Set();
    for (const b of existingBookings ?? []) {
        const arr = b.hourly_hours;
        if (Array.isArray(arr)) {
            for (const h of arr) {
                if (Number.isInteger(h) && h >= 0 && h <= 23)
                    takenSet.add(h);
            }
        }
    }
    hours = hours.filter((h) => !takenSet.has(h));
    res.json({ hours });
});
router.get("/me/hotel", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
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
    const out = { ...hotel };
    if (hotel.profile_image) {
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.profile_image, 3600);
        if (signed?.signedUrl)
            out.profile_image_url = signed.signedUrl;
    }
    if (hotel.cover_image) {
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.cover_image, 3600);
        if (signed?.signedUrl)
            out.cover_image_url = signed.signedUrl;
    }
    if (hotel.payment_qr_image) {
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(hotel.payment_qr_image, 3600);
        if (signed?.signedUrl)
            out.payment_qr_image_url = signed.signedUrl;
    }
    const { data: methods } = await supabaseClient_1.supabaseAdmin
        .from("hotel_payment_methods")
        .select("id, label, qr_image_path, account_name, account_number, sort_order")
        .eq("hotel_id", profile.hotel_id)
        .order("sort_order", { ascending: true });
    const paymentMethods = [];
    for (const m of methods ?? []) {
        const row = m;
        let qr_image_url;
        if (row.qr_image_path) {
            const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(row.qr_image_path, 3600);
            if (signed?.signedUrl)
                qr_image_url = signed.signedUrl;
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
/** PATCH /api/hotel/profile — update bio, description, opening_hours, check_in_time, check_out_time. */
router.patch("/hotel/profile", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const { description, bio, opening_hours, check_in_time, check_out_time, payment_account_name, payment_account_number, currency, pets_policy, smoking_policy, cancellation_policy } = req.body;
    const updates = {};
    if (description !== undefined)
        updates.description = description;
    if (bio !== undefined)
        updates.bio = bio;
    if (opening_hours !== undefined)
        updates.opening_hours = opening_hours ?? {};
    if (check_in_time !== undefined)
        updates.check_in_time = check_in_time || null;
    if (check_out_time !== undefined)
        updates.check_out_time = check_out_time || null;
    if (payment_account_name !== undefined)
        updates.payment_account_name = payment_account_name || null;
    if (payment_account_number !== undefined)
        updates.payment_account_number = payment_account_number || null;
    if (currency !== undefined) {
        const code = typeof currency === "string" ? currency.trim().toUpperCase() || "PHP" : "PHP";
        updates.currency = code;
    }
    if (pets_policy !== undefined)
        updates.pets_policy = pets_policy != null ? String(pets_policy).trim() || null : null;
    if (smoking_policy !== undefined)
        updates.smoking_policy = smoking_policy != null ? String(smoking_policy).trim() || null : null;
    if (cancellation_policy !== undefined)
        updates.cancellation_policy = cancellation_policy != null ? String(cancellation_policy).trim() || null : null;
    if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
    }
    const { data: hotel, error: updateError } = await supabaseClient_1.supabaseAdmin
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
router.post("/hotel/profile-image", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), upload.single("profile_image"), async (req, res) => {
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
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const filePath = `profile-images/${profile.hotel_id}/avatar.${ext}`;
    const { error: uploadError } = await supabaseClient_1.supabaseAdmin.storage
        .from("hotel-assets")
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) {
        res.status(500).json({ error: uploadError.message ?? "Failed to upload image" });
        return;
    }
    const { error: updateError } = await supabaseClient_1.supabaseAdmin
        .from("hotels")
        .update({ profile_image: filePath })
        .eq("id", profile.hotel_id);
    if (updateError) {
        res.status(500).json({ error: "Failed to save profile image" });
        return;
    }
    res.json({ profile_image: filePath, message: "Profile image updated." });
});
/** POST /api/hotel/cover-image — upload hotel cover/background image. */
router.post("/hotel/cover-image", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), upload.single("cover_image"), async (req, res) => {
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
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const filePath = `cover-images/${profile.hotel_id}/cover.${ext}`;
    const { error: uploadError } = await supabaseClient_1.supabaseAdmin.storage
        .from("hotel-assets")
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) {
        res.status(500).json({ error: uploadError.message ?? "Failed to upload image" });
        return;
    }
    const { error: updateError } = await supabaseClient_1.supabaseAdmin
        .from("hotels")
        .update({ cover_image: filePath })
        .eq("id", profile.hotel_id);
    if (updateError) {
        res.status(500).json({ error: "Failed to save cover image" });
        return;
    }
    res.json({ cover_image: filePath, message: "Cover image updated." });
});
/** POST /api/hotel/payment-qr — upload payment QR code image for online payment. */
router.post("/hotel/payment-qr", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), upload.single("payment_qr_image"), async (req, res) => {
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
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const filePath = `payment-qr/${profile.hotel_id}/qr.${ext}`;
    const { error: uploadError } = await supabaseClient_1.supabaseAdmin.storage
        .from("hotel-assets")
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) {
        res.status(500).json({ error: uploadError.message ?? "Failed to upload image" });
        return;
    }
    const { error: updateError } = await supabaseClient_1.supabaseAdmin
        .from("hotels")
        .update({ payment_qr_image: filePath })
        .eq("id", profile.hotel_id);
    if (updateError) {
        res.status(500).json({ error: "Failed to save payment QR" });
        return;
    }
    res.json({ payment_qr_image: filePath, message: "Payment QR updated." });
});
/** GET /api/hotel/payment-methods — list payment methods for the authenticated hotel. */
router.get("/hotel/payment-methods", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const { data: rows, error } = await supabaseClient_1.supabaseAdmin
        .from("hotel_payment_methods")
        .select("id, label, qr_image_path, account_name, account_number, sort_order")
        .eq("hotel_id", profile.hotel_id)
        .order("sort_order", { ascending: true });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    const list = [];
    for (const row of rows ?? []) {
        const r = row;
        let qr_image_url;
        if (r.qr_image_path) {
            const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(r.qr_image_path, 3600);
            if (signed?.signedUrl)
                qr_image_url = signed.signedUrl;
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
router.post("/hotel/payment-methods", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), upload.single("qr_image"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const { label, account_name, account_number } = req.body;
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
        const { error: uploadError } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
        if (uploadError) {
            res.status(500).json({ error: uploadError.message ?? "Failed to upload image" });
            return;
        }
    }
    const { data: existing } = await supabaseClient_1.supabaseAdmin
        .from("hotel_payment_methods")
        .select("sort_order")
        .eq("hotel_id", profile.hotel_id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();
    const sort_order = existing?.sort_order ?? -1;
    const { data: inserted, error: insertError } = await supabaseClient_1.supabaseAdmin
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
    const row = inserted;
    let qr_image_url;
    if (row.qr_image_path) {
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(row.qr_image_path, 3600);
        if (signed?.signedUrl)
            qr_image_url = signed.signedUrl;
    }
    res.status(201).json({
        id: row.id,
        label: row.label,
        qr_image_url,
        account_name: row.account_name ?? null,
        account_number: row.account_number ?? null,
        sort_order: row.sort_order ?? 0
    });
});
/** PATCH /api/hotel/payment-methods/:id — update label, account_name, account_number; optional new qr_image. */
router.patch("/hotel/payment-methods/:id", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), upload.single("qr_image"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const methodId = req.params.id;
    const { label, account_name, account_number } = req.body;
    const file = req.file;
    const updates = {};
    if (label !== undefined)
        updates.label = (label ?? "").trim() || "Payment";
    if (account_name !== undefined)
        updates.account_name = (account_name ?? "").trim() || null;
    if (account_number !== undefined)
        updates.account_number = (account_number ?? "").trim() || null;
    if (file?.mimetype?.startsWith("image/")) {
        const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
        const filePath = `payment-methods/${profile.hotel_id}/${methodId}.${ext}`;
        const { error: uploadError } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
        if (!uploadError)
            updates.qr_image_path = filePath;
    }
    if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
    }
    const { data: updated, error: updateError } = await supabaseClient_1.supabaseAdmin
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
    const row = updated;
    let qr_image_url;
    if (row.qr_image_path) {
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(row.qr_image_path, 3600);
        if (signed?.signedUrl)
            qr_image_url = signed.signedUrl;
    }
    res.json({
        id: row.id,
        label: row.label,
        qr_image_url,
        account_name: row.account_name ?? null,
        account_number: row.account_number ?? null,
        sort_order: row.sort_order ?? 0
    });
});
/** DELETE /api/hotel/payment-methods/:id */
router.delete("/hotel/payment-methods/:id", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const { error } = await supabaseClient_1.supabaseAdmin
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
router.post("/hotel/permit", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), upload.single("business_permit"), async (req, res) => {
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
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const safeName = (file.originalname || "file").replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `business-permits/${Date.now()}-${safeName}`;
    const { data: uploadData, error: uploadError } = await supabaseClient_1.supabaseAdmin.storage
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
    const { error: updateError } = await supabaseClient_1.supabaseAdmin
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
});
router.get("/hotel/rooms", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
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
                    const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
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
router.get("/hotel/rooms/:id", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
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
    const room = data;
    const media = room.media ?? [];
    if (Array.isArray(media) && media.length > 0) {
        room.media_urls = [];
        for (const item of media) {
            if (!item?.path)
                continue;
            const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
                .from("hotel-assets")
                .createSignedUrl(item.path, 3600);
            if (signed?.signedUrl) {
                room.media_urls.push({
                    type: item.type || "image",
                    url: signed.signedUrl
                });
            }
        }
    }
    res.json(room);
});
/** POST /api/hotel/rooms — create a room for the authenticated hotel. */
router.post("/hotel/rooms", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const { name, room_type, base_price_night, hourly_rate, capacity, amenities, description, offer_hourly, is_available, media, bathroom_count, bathroom_shared, hourly_available_hours: hourlyAvailableHoursRaw, featured, pets_policy, smoking_policy, cancellation_policy, custom_policies } = req.body;
    if (!name || !room_type || base_price_night == null || !capacity) {
        res.status(400).json({
            error: "Missing required fields: name, room_type, base_price_night, capacity"
        });
        return;
    }
    const basePrice = Number(base_price_night);
    const cap = Number(capacity);
    const offerHourly = Boolean(offer_hourly);
    const hourly = offerHourly && hourly_rate != null && String(hourly_rate).trim() !== ""
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
    const bathroomCnt = bathroom_count != null && String(bathroom_count).trim() !== ""
        ? Number(bathroom_count)
        : null;
    if (bathroomCnt != null && (Number.isNaN(bathroomCnt) || bathroomCnt < 0)) {
        res.status(400).json({ error: "bathroom_count must be >= 0 when provided" });
        return;
    }
    const bathroomShared = bathroom_shared === undefined || bathroom_shared === null ? null : Boolean(bathroom_shared);
    const mediaArr = Array.isArray(media) ? media : [];
    if (mediaArr.length > 10) {
        res.status(400).json({ error: "Maximum 10 media items (images + 1 video)" });
        return;
    }
    const videoCount = mediaArr.filter((m) => m?.type === "video").length;
    if (videoCount > 1) {
        res.status(400).json({ error: "Maximum 1 video allowed" });
        return;
    }
    const hourlyAvailableHours = normalizeHourlyAvailableHours(hourlyAvailableHoursRaw, offerHourly);
    const payload = {
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
        cancellation_policy: cancellation_policy != null ? String(cancellation_policy).trim() || null : null,
        custom_policies: sanitizeCustomPolicies(custom_policies)
    };
    const { data, error } = await supabaseClient_1.supabaseAdmin.from("rooms").insert(payload).select("*").single();
    if (error) {
        res.status(500).json({ error: error.message ?? "Failed to create room" });
        return;
    }
    res.status(201).json(data);
});
/** PATCH /api/hotel/rooms/:id — update a room (must belong to authenticated hotel). */
router.patch("/hotel/rooms/:id", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const roomId = req.params.id;
    const { name, room_type, base_price_night, hourly_rate, capacity, amenities, description, offer_hourly, is_available, media, bathroom_count, bathroom_shared, hourly_available_hours: hourlyAvailableHoursRaw, featured, pets_policy, smoking_policy, cancellation_policy, custom_policies } = req.body;
    const updates = {};
    if (name !== undefined)
        updates.name = String(name).trim();
    if (room_type !== undefined)
        updates.room_type = String(room_type).trim();
    if (description !== undefined)
        updates.description = String(description).trim() || null;
    if (offer_hourly !== undefined)
        updates.offer_hourly = Boolean(offer_hourly);
    if (is_available !== undefined)
        updates.is_available = Boolean(is_available);
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
        }
        else if (!offer_hourly) {
            updates.hourly_rate = null;
        }
    }
    if (hourlyAvailableHoursRaw !== undefined) {
        updates.hourly_available_hours = normalizeHourlyAvailableHours(hourlyAvailableHoursRaw, offer_hourly !== false);
    }
    if (capacity !== undefined) {
        const v = Number(capacity);
        if (Number.isNaN(v) || v < 1) {
            res.status(400).json({ error: "capacity must be >= 1" });
            return;
        }
        updates.capacity = v;
    }
    if (amenities !== undefined)
        updates.amenities = Array.isArray(amenities) ? amenities : [];
    if (bathroom_count !== undefined) {
        const v = bathroom_count == null || String(bathroom_count).trim() === ""
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
        if (mediaArr.filter((m) => m?.type === "video").length > 1) {
            res.status(400).json({ error: "Maximum 1 video allowed" });
            return;
        }
        updates.media = mediaArr;
    }
    if (featured !== undefined)
        updates.featured = Boolean(featured);
    if (pets_policy !== undefined)
        updates.pets_policy = pets_policy != null ? String(pets_policy).trim() || null : null;
    if (smoking_policy !== undefined)
        updates.smoking_policy = smoking_policy != null ? String(smoking_policy).trim() || null : null;
    if (cancellation_policy !== undefined)
        updates.cancellation_policy = cancellation_policy != null ? String(cancellation_policy).trim() || null : null;
    if (custom_policies !== undefined)
        updates.custom_policies = sanitizeCustomPolicies(custom_policies);
    if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
    }
    const { data, error } = await supabaseClient_1.supabaseAdmin
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
router.delete("/hotel/rooms/:id", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const { error } = await supabaseClient_1.supabaseAdmin
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
router.post("/hotel/rooms/:id/media", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), upload.single("media"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({
            error: "Supabase session required (send x-supabase-access-token)"
        });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
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
    const { data: room, error: roomError } = await supabaseClient_1.supabaseAdmin
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
    const hasVideo = media.some((m) => m?.type === "video");
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
    const { error: uploadError } = await supabaseClient_1.supabaseAdmin.storage
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
    const { data: updated, error: updateError } = await supabaseClient_1.supabaseAdmin
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
});
router.get("/hotel/bookings", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
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
    const bookings = (data ?? []);
    const userIds = Array.from(new Set(bookings.map((b) => b.user_id).filter((id) => typeof id === "string")));
    const guestById = new Map();
    if (userIds.length > 0) {
        const { data: profiles } = await supabaseClient_1.supabaseAdmin
            .from("profiles")
            .select("id, email, full_name")
            .in("id", userIds);
        for (const p of profiles ?? []) {
            guestById.set(p.id, {
                email: p.email ?? null,
                full_name: p.full_name ?? null
            });
        }
    }
    for (const b of bookings) {
        const uid = b.user_id;
        b.guest = guestById.get(uid ?? "") ?? {
            email: null,
            full_name: null
        };
    }
    res.json(bookings);
});
/** GET /api/hotel/bookings/:id — single booking detail (must belong to hotel). */
router.get("/hotel/bookings/:id", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const bookingId = req.params.id;
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
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
    const roomsRaw = booking.rooms;
    const room = Array.isArray(roomsRaw) ? roomsRaw[0] : roomsRaw;
    if (!room || room.hotel_id !== profile.hotel_id) {
        res.status(404).json({ error: "Booking not found" });
        return;
    }
    const userId = booking.user_id;
    const { data: guestProfile } = await supabaseClient_1.supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", userId)
        .single();
    const guest = guestProfile
        ? { email: guestProfile.email ?? null, full_name: guestProfile.full_name ?? null }
        : { email: null, full_name: null };
    const out = { ...booking, guest };
    const receiptPath = booking.payment_receipt_path;
    if (receiptPath) {
        const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
            .from("hotel-assets")
            .createSignedUrl(receiptPath, 3600);
        if (signed?.signedUrl)
            out.payment_receipt_url = signed.signedUrl;
    }
    const payMethod = String(booking.payment_method ?? "")
        .toLowerCase()
        .trim();
    if (payMethod === "online" && room.hotel_id) {
        const pmId = booking.hotel_payment_method_id;
        let online_payment_details = null;
        if (pmId) {
            const { data: pm } = await supabaseClient_1.supabaseAdmin
                .from("hotel_payment_methods")
                .select("label, account_name, account_number, hotel_id, qr_image_path")
                .eq("id", pmId)
                .single();
            const prow = pm;
            if (prow && prow.hotel_id === room.hotel_id) {
                let qr_image_url = null;
                if (prow.qr_image_path) {
                    const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
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
            const { data: hrow } = await supabaseClient_1.supabaseAdmin
                .from("hotels")
                .select("payment_account_name, payment_account_number, payment_qr_image")
                .eq("id", room.hotel_id)
                .single();
            const h = hrow;
            if (h) {
                let qr_image_url = null;
                if (h.payment_qr_image) {
                    const { data: signed } = await supabaseClient_1.supabaseAdmin.storage
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
router.patch("/hotel/bookings/:id/confirm", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({
            error: "Supabase session required (send x-supabase-access-token)"
        });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const rawBid = req.params.id;
    const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
    if (!bookingId) {
        res.status(400).json({ error: "Invalid booking id" });
        return;
    }
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
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
    const room = booking.rooms;
    if (!room || room.hotel_id !== profile.hotel_id) {
        res.status(404).json({ error: "Booking not found" });
        return;
    }
    if (booking.status !== "pending") {
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
        const guestId = updated.user_id;
        if (guestId)
            (0, realtime_1.notifyGuestBookingConfirmed)(guestId, bookingId);
    }
    catch (e) {
        console.warn("[realtime] notifyGuestBookingConfirmed failed", e);
    }
    res.json(updated);
});
/** PATCH /api/hotel/bookings/:id/decline — set status to cancelled and store reason. */
router.patch("/hotel/bookings/:id/decline", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    const rawBid = req.params.id;
    const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
    if (!bookingId) {
        res.status(400).json({ error: "Invalid booking id" });
        return;
    }
    const { reason } = req.body;
    if (!reason || typeof reason !== "string" || !reason.trim()) {
        res.status(400).json({ error: "Reason for declining is required" });
        return;
    }
    const { data: profile, error: profileError } = await supabaseClient_1.supabaseAdmin
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
        .single();
    if (profileError || !profile?.hotel_id) {
        res.status(404).json({ error: "No linked hotel found" });
        return;
    }
    const { data: booking, error: fetchError } = await supabaseClient_1.supabaseAdmin
        .from("bookings")
        .select("id, status, room_id, user_id")
        .eq("id", bookingId)
        .single();
    if (fetchError || !booking) {
        res.status(404).json({ error: "Booking not found" });
        return;
    }
    const { data: room } = await supabaseClient_1.supabaseAdmin
        .from("rooms")
        .select("hotel_id")
        .eq("id", booking.room_id)
        .single();
    if (!room || room.hotel_id !== profile.hotel_id) {
        res.status(404).json({ error: "Booking not found" });
        return;
    }
    if (booking.status !== "pending") {
        res.status(400).json({ error: "Only pending bookings can be declined" });
        return;
    }
    const { data: updated, error: updateError } = await supabaseClient_1.supabaseAdmin
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
        const guestId = booking.user_id;
        if (guestId)
            (0, realtime_1.notifyGuestBookingDeclined)(guestId, bookingId);
    }
    catch (e) {
        console.warn("[realtime] notifyGuestBookingDeclined failed", e);
    }
    res.json(updated);
});
/** PATCH /api/hotel/bookings/:id/mark-paid — set payment_status to paid. */
router.patch("/hotel/bookings/:id/mark-paid", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({
            error: "Supabase session required (send x-supabase-access-token)"
        });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const rawBid = req.params.id;
    const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
    if (!bookingId) {
        res.status(400).json({ error: "Invalid booking id" });
        return;
    }
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
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
    const room = booking.rooms;
    if (!room || room.hotel_id !== profile.hotel_id) {
        res.status(404).json({ error: "Booking not found" });
        return;
    }
    const b = booking;
    if (b.status !== "confirmed") {
        res.status(400).json({ error: "Only confirmed bookings can be marked as paid" });
        return;
    }
    if (b.payment_status !== "pending") {
        res.status(400).json({ error: "Payment is not awaiting verification" });
        return;
    }
    if ((b.payment_method ?? "").toLowerCase() === "online" &&
        !(b.payment_receipt_path && String(b.payment_receipt_path).trim())) {
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
        const guestId = updated.user_id;
        if (guestId)
            (0, realtime_1.notifyGuestPaymentApproved)(guestId, bookingId);
    }
    catch (e) {
        console.warn("[realtime] notifyGuestPaymentApproved failed", e);
    }
    res.json(updated);
});
/** PATCH /api/hotel/bookings/:id/reject-receipt — clear receipt so guest can upload new proof (confirmed, payment pending, online). */
router.patch("/hotel/bookings/:id/reject-receipt", auth_1.authenticate, (0, auth_1.requireRole)("hotel"), async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({
            error: "Supabase session required (send x-supabase-access-token)"
        });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const rawBid = req.params.id;
    const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
    if (!bookingId) {
        res.status(400).json({ error: "Invalid booking id" });
        return;
    }
    const { note } = req.body;
    const noteTrimmed = typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : null;
    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("hotel_id")
        .eq("id", req.user.sub)
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
    const room = booking.rooms;
    if (!room || room.hotel_id !== profile.hotel_id) {
        res.status(404).json({ error: "Booking not found" });
        return;
    }
    const b = booking;
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
        const guestId = updated.user_id;
        if (guestId)
            (0, realtime_1.notifyGuestReceiptRejected)(guestId, bookingId);
    }
    catch (e) {
        console.warn("[realtime] notifyGuestReceiptRejected failed", e);
    }
    res.json(updated);
});
exports.default = router;
