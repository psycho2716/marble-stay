import { Router } from "express";
import type { Request } from "express";
import multer from "multer";
import { supabaseClient, supabaseAdmin, createSupabaseClientForUser } from "../config/supabaseClient";
import { authenticate, type AuthPayload } from "../middleware/auth";
import {
  emitBookingMessage,
  notifyHotelNewBooking,
  notifyHotelReceiptUploaded,
  notifyNewChatMessage
} from "../realtime";
import {
  formatReceiptAmount,
  formatReceiptLabels,
  paymentMethodLabel,
  pipeBookingEreceiptPdf,
} from "../lib/bookingReceiptPdf";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const MESSAGE_MAX_LEN = 5000;

async function assertBookingMessageAccess(
  userId: string,
  role: AuthPayload["role"],
  bookingId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("user_id, rooms!inner(hotel_id)")
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    return { ok: false, status: 404, error: "Booking not found" };
  }

  const b = booking as { user_id: string; rooms?: { hotel_id: string } | { hotel_id: string }[] };
  const room = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms;
  const hotelId = room?.hotel_id;

  if (role === "guest") {
    if (b.user_id === userId) return { ok: true };
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (role === "hotel") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("hotel_id")
      .eq("id", userId)
      .single();
    const ph = profile as { hotel_id?: string | null } | null;
    if (ph?.hotel_id && hotelId && ph.hotel_id === hotelId) return { ok: true };
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: false, status: 403, error: "Forbidden" };
}

router.post(
  "/bookings",
  authenticate,
  upload.single("receipt"),
  async (req: Request, res): Promise<void> => {
    if (!req.supabaseAccessToken) {
      res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
      return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const {
      room_id,
      check_in,
      check_out,
      booking_type,
      hours: hoursRaw,
      payment_method,
      hotel_payment_method_id: hotelPaymentMethodIdRaw,
    } = req.body as {
      room_id?: string;
      check_in?: string;
      check_out?: string;
      booking_type?: string;
      hours?: string | number[];
      payment_method?: string;
      hotel_payment_method_id?: string;
    };
    const hotelPaymentMethodId =
      typeof hotelPaymentMethodIdRaw === "string" && hotelPaymentMethodIdRaw.trim()
        ? hotelPaymentMethodIdRaw.trim()
        : null;
    const receiptFile = req.file;

    let hours: number[] | undefined;
    if (Array.isArray(hoursRaw)) {
      hours = hoursRaw;
    } else if (typeof hoursRaw === "string") {
      try {
        const parsed = JSON.parse(hoursRaw) as unknown;
        hours = Array.isArray(parsed) ? (parsed as number[]) : undefined;
      } catch {
        hours = undefined;
      }
    }

    if (!room_id || !check_in || !check_out) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const isOnlinePayment = payment_method === "online";
    if (isOnlinePayment && !receiptFile) {
      res.status(400).json({ error: "Payment receipt image is required for online payment." });
      return;
    }
    if (isOnlinePayment && receiptFile && !/^image\//.test(receiptFile.mimetype)) {
      res.status(400).json({ error: "Receipt must be an image (e.g. JPEG, PNG)." });
      return;
    }

    const userId = req.user!.sub;

    const effectiveType = booking_type === "hourly" ? "hourly" : "nightly";

    const { data: room, error: roomError } = await supabaseClient
      .from("rooms")
      .select("id, hotel_id, base_price_night, hourly_rate, hourly_available_hours, is_available")
      .eq("id", room_id)
      .single();

    if (roomError || !room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const roomHotelId = (room as { hotel_id?: string }).hotel_id;

    let hotelHasConfiguredProviders = false;
    if (roomHotelId) {
      const { data: hotelProviderRows } = await supabaseAdmin
        .from("hotel_payment_methods")
        .select("id")
        .eq("hotel_id", roomHotelId);
      hotelHasConfiguredProviders = (hotelProviderRows?.length ?? 0) > 0;
    }

    let resolvedHotelPaymentMethodId: string | null = null;
    if (isOnlinePayment && hotelHasConfiguredProviders) {
      if (!hotelPaymentMethodId) {
        res.status(400).json({
          error: "Please select which online payment method you are paying to (e.g. GCash or Maya).",
        });
        return;
      }
      if (!roomHotelId) {
        res.status(400).json({ error: "Invalid room configuration" });
        return;
      }
      const { data: pmRow, error: pmErr } = await supabaseAdmin
        .from("hotel_payment_methods")
        .select("id, hotel_id")
        .eq("id", hotelPaymentMethodId)
        .single();
      if (pmErr || !pmRow || (pmRow as { hotel_id: string }).hotel_id !== roomHotelId) {
        res.status(400).json({ error: "Invalid payment provider for this hotel" });
        return;
      }
      resolvedHotelPaymentMethodId = hotelPaymentMethodId;
    }
    if ((room as unknown as { is_available?: boolean }).is_available === false) {
      res.status(400).json({ error: "Room is currently unavailable" });
      return;
    }

    let totalAmount = 0;

    if (effectiveType === "nightly") {
      const { data: availability, error: availabilityError } =
        await supabaseClient
          .from("room_availability")
          .select("date, available, room_id")
          .eq("room_id", room_id)
          .gte("date", check_in)
          .lte("date", check_out);

      if (availabilityError) {
        res.status(500).json({ error: "Failed to check availability" });
        return;
      }

      if (!availability || availability.some((d) => !d.available)) {
        res
          .status(400)
          .json({ error: "Room not available for selected dates" });
        return;
      }

      const nights =
        (new Date(check_out).getTime() - new Date(check_in).getTime()) /
        (1000 * 60 * 60 * 24);

      if (!Number.isFinite(nights) || nights <= 0) {
        res.status(400).json({ error: "Invalid date range" });
        return;
      }

      totalAmount = nights * Number(room.base_price_night);
    } else {
      if (!hours || !Array.isArray(hours) || hours.length === 0) {
        res.status(400).json({ error: "Hours array required for hourly" });
        return;
      }

      const bookingDate = check_in;

      const { data: slots, error: slotsError } = await supabaseClient
        .from("room_hourly_slots")
        .select("hour, available")
        .eq("room_id", room_id)
        .eq("date", bookingDate)
        .in("hour", hours);

      if (slotsError) {
        res.status(500).json({ error: "Failed to check hourly availability" });
        return;
      }

      // Hourly availability rules:
      // - If a slot row exists and available=false -> NOT available
      // - If a slot row exists and available=true  -> available
      // - If no slot row exists, fallback to room.hourly_available_hours (if configured)
      const configuredHours = Array.isArray(room.hourly_available_hours)
        ? (room.hourly_available_hours as number[])
        : null;
      const configuredSet = configuredHours ? new Set(configuredHours) : null;
      const slotMap = new Map<number, boolean>();
      for (const s of slots ?? []) {
        const hour = Number((s as { hour: unknown }).hour);
        if (!Number.isFinite(hour)) continue;
        slotMap.set(hour, Boolean((s as { available: unknown }).available));
      }
      const anyUnavailable = hours.some((h) => {
        const explicit = slotMap.get(h);
        if (explicit === false) return true;
        if (explicit === true) return false;
        // missing row -> only allowed if configured on the room
        return !(configuredSet?.has(h));
      });
      if (anyUnavailable) {
        res.status(400).json({ error: "One or more hours not available" });
        return;
      }

      if (!room.hourly_rate) {
        res.status(400).json({ error: "Room has no hourly rate configured" });
        return;
      }

      totalAmount = hours.length * Number(room.hourly_rate);
    }

    // Persisted check-in/out values:
    // - Nightly: use user-provided dates
    // - Hourly: store check_in at the selected date, and check_out as +1 day to satisfy
    //   the bookings_check_out_after_check_in constraint (hourly availability uses room_hourly_slots).
    const hourlyCheckIn = effectiveType === "hourly" ? new Date(check_in) : null;
    const checkInValue =
      effectiveType === "hourly" && hourlyCheckIn
        ? hourlyCheckIn.toISOString()
        : check_in;
    const checkOutValue =
      effectiveType === "hourly" && hourlyCheckIn
        ? new Date(hourlyCheckIn.getTime() + 24 * 60 * 60 * 1000).toISOString()
        : check_out;

    const { data: booking, error: bookingError } = await db
      .from("bookings")
      .insert({
        user_id: userId,
        room_id,
        check_in: checkInValue,
        check_out: checkOutValue,
        booking_type: effectiveType,
        total_amount: totalAmount,
        status: "pending",
        payment_status: "pending",
        payment_method: isOnlinePayment ? "online" : "cash",
        payment_receipt_path: null,
        hourly_hours: effectiveType === "hourly" ? hours : null,
        hotel_payment_method_id: resolvedHotelPaymentMethodId,
      })
      .select("*")
      .single();

    if (bookingError || !booking) {
      console.error("[bookings] Failed to create booking:", bookingError?.message);
      res.status(500).json({ error: bookingError?.message ?? "Failed to create booking" });
      return;
    }

    if (isOnlinePayment && receiptFile && booking.id) {
      const ext = receiptFile.mimetype.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
      const filePath = `booking-receipts/${booking.id}/receipt.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("hotel-assets")
        .upload(filePath, receiptFile.buffer, { contentType: receiptFile.mimetype, upsert: true });
      if (!uploadError) {
        await db.from("bookings").update({ payment_receipt_path: filePath }).eq("id", booking.id);
      }
    }

    const { data: updated } = await db.from("bookings").select("*").eq("id", booking.id).single();
    const finalBooking = updated ?? booking;
    if (roomHotelId && finalBooking && typeof (finalBooking as { id?: string }).id === "string") {
      const { data: guestProf } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .single();
      const gp = guestProf as { full_name?: string | null; email?: string | null } | null;
      const guestLabel = gp?.full_name?.trim() || gp?.email?.trim() || "A guest";
      try {
        notifyHotelNewBooking(roomHotelId, (finalBooking as { id: string }).id, guestLabel);
      } catch (e) {
        console.warn("[realtime] notifyHotelNewBooking failed", e);
      }
    }
    res.status(201).json(finalBooking);
  }
);

async function signedHotelCoverUrl(hotel: {
  profile_image?: string | null;
  images?: string[] | null;
}): Promise<string | null> {
  const tryPath = async (path: string | null | undefined) => {
    const p = path?.trim();
    if (!p) return null;
    const { data: signed } = await supabaseAdmin.storage
      .from("hotel-assets")
      .createSignedUrl(p, 3600);
    return signed?.signedUrl ?? null;
  };
  const fromProfile = await tryPath(hotel.profile_image ?? null);
  if (fromProfile) return fromProfile;
  const first = hotel.images?.find((x) => typeof x === "string" && x.trim());
  return tryPath(first ?? null);
}

/** Signed view URLs for room gallery (guest booking detail). */
async function signedRoomMediaUrls(
  media: unknown
): Promise<Array<{ type: "image" | "video"; url: string }>> {
  if (!Array.isArray(media)) return [];
  const out: Array<{ type: "image" | "video"; url: string }> = [];
  for (const item of media) {
    const path = (item as { path?: string })?.path?.trim();
    if (!path) continue;
    const type = (item as { type?: string }).type === "video" ? "video" : "image";
    const { data: signed } = await supabaseAdmin.storage
      .from("hotel-assets")
      .createSignedUrl(path, 3600);
    if (signed?.signedUrl) out.push({ type, url: signed.signedUrl });
  }
  return out;
}

function bookingDetailRoomRow(r: unknown): Record<string, unknown> | null {
  if (!r || typeof r !== "object") return null;
  if (Array.isArray(r)) return (r[0] as Record<string, unknown>) ?? null;
  return r as Record<string, unknown>;
}

function firstQueryParam(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v[0];
  return String(v);
}

router.get(
  "/bookings",
  authenticate,
  async (req: Request, res): Promise<void> => {
    const userId = req.user!.sub;
    // Always use service role for this read. User-scoped Supabase RLS only allows nested
    // `rooms` / `hotels` when the hotel is verified; guests with bookings at non-verified
    // hotels (or legacy rows) would get a PostgREST/RLS error and an empty error toast on
    // the client. JWT is already verified; scope is strictly .eq("user_id", userId).

    const pageStr = firstQueryParam(req.query.page);
    const limitStr = firstQueryParam(req.query.limit);
    const hasPaging = pageStr !== undefined || limitStr !== undefined;
    const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
    const limit = hasPaging
      ? Math.min(100, Math.max(1, parseInt(limitStr ?? "10", 10) || 10))
      : 0;

    const selection =
      "*, rooms(hotel_id, name, hotels(id, name, address, images, profile_image, check_in_time, check_out_time, currency))";

    const from = (page - 1) * limit;
    const { data, error, count } = hasPaging
      ? await supabaseAdmin
          .from("bookings")
          .select(selection, { count: "exact" })
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .range(from, from + limit - 1)
      : await supabaseAdmin
          .from("bookings")
          .select(selection)
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: "Failed to load bookings" });
      return;
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const total = hasPaging ? count ?? 0 : rows.length;
    const coverByHotelId = new Map<string, string | null>();

    const out = await Promise.all(
      rows.map(async (b) => {
        const room = b.rooms as { hotels?: unknown } | null | undefined;
        const h = room?.hotels;
        const hotel = (Array.isArray(h) ? h[0] : h) as
          | {
              id?: string;
              name?: string | null;
              address?: string | null;
              images?: string[] | null;
              profile_image?: string | null;
            }
          | null
          | undefined;
        let hotel_cover_url: string | null = null;
        if (hotel?.id) {
          if (!coverByHotelId.has(hotel.id)) {
            coverByHotelId.set(hotel.id, await signedHotelCoverUrl(hotel));
          }
          hotel_cover_url = coverByHotelId.get(hotel.id) ?? null;
        }
        return { ...b, hotel_cover_url };
      })
    );

    const bookingIds = out.map((b) => String((b as { id: unknown }).id));
    const { data: existingReviews } = await supabaseAdmin
      .from("reviews")
      .select("booking_id")
      .in("booking_id", bookingIds);
    const reviewedBookingIds = new Set(
      (existingReviews ?? []).map((r) => String((r as { booking_id: string }).booking_id))
    );

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    ).toISOString();
    const { data: monthReviews } = await supabaseAdmin
      .from("reviews")
      .select("booking_id")
      .eq("user_id", userId)
      .gte("created_at", thisMonthStart)
      .lte("created_at", thisMonthEnd);

    const monthReviewBookingIds = (monthReviews ?? []).map((r) =>
      String((r as { booking_id: string }).booking_id)
    );
    const hotelsReviewedThisMonth = new Set<string>();
    if (monthReviewBookingIds.length > 0) {
      const { data: br } = await supabaseAdmin
        .from("bookings")
        .select("room_id")
        .in("id", monthReviewBookingIds);
      const roomIds = [
        ...new Set(
          (br ?? [])
            .map((x) => (x as { room_id?: string }).room_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      ];
      if (roomIds.length > 0) {
        const { data: roomsData } = await supabaseAdmin
          .from("rooms")
          .select("hotel_id")
          .in("id", roomIds);
        for (const row of roomsData ?? []) {
          const hid = (row as { hotel_id?: string }).hotel_id;
          if (hid) hotelsReviewedThisMonth.add(hid);
        }
      }
    }

    const HOTEL_MONTH_MSG =
      "You can only rate each property once per month. Try again next month.";

    const enriched = out.map((b) => {
      const id = String((b as { id: unknown }).id);
      const st = String((b as { status?: string }).status ?? "").toLowerCase();
      const checkOutPast = new Date((b as { check_out: string }).check_out) <= new Date();
      const hasReview = reviewedBookingIds.has(id);

      const roomRaw = (b as { rooms?: unknown }).rooms;
      const roomSingle = Array.isArray(roomRaw) ? roomRaw[0] : roomRaw;
      let hotelId: string | null =
        roomSingle && typeof roomSingle === "object"
          ? String((roomSingle as { hotel_id?: string }).hotel_id ?? "") || null
          : null;
      if (!hotelId && roomSingle && typeof roomSingle === "object") {
        const h = (roomSingle as { hotels?: { id?: string } | { id?: string }[] }).hotels;
        const hotel = Array.isArray(h) ? h[0] : h;
        if (hotel?.id) hotelId = String(hotel.id);
      }

      const eligibleBase =
        checkOutPast &&
        ["confirmed", "completed"].includes(st) &&
        st !== "pending" &&
        st !== "cancelled";

      const hotelBlocked = Boolean(hotelId && hotelsReviewedThisMonth.has(hotelId));
      const can_rate_stay = Boolean(!hasReview && eligibleBase && !hotelBlocked);
      const rate_stay_block_reason =
        !hasReview && eligibleBase && hotelBlocked ? HOTEL_MONTH_MSG : null;

      return {
        ...b,
        has_review: hasReview,
        can_rate_stay,
        rate_stay_block_reason,
      };
    });

    res.json({
      bookings: enriched,
      total,
      page: hasPaging ? page : 1,
      limit: hasPaging ? limit : enriched.length,
    });
  }
);

/** GET /api/bookings/:id/messages — guest or hotel staff for this booking. */
router.get("/bookings/:bookingId/messages", authenticate, async (req: Request, res): Promise<void> => {
  const rawBid = req.params.bookingId;
  const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
  if (!bookingId) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  const userId = req.user!.sub;
  const role = req.user!.role;

  const access = await assertBookingMessageAccess(userId, role, bookingId);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { data: rows, error } = await supabaseAdmin
    .from("booking_messages")
    .select("id, booking_id, sender_id, body, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message ?? "Failed to load messages" });
    return;
  }

  const senderIds = Array.from(
    new Set((rows ?? []).map((r) => (r as { sender_id: string }).sender_id).filter(Boolean))
  );
  const profileById = new Map<
    string,
    { full_name: string | null; email: string | null; role: string | null }
  >();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .in("id", senderIds);
    for (const p of profiles ?? []) {
      const row = p as { id: string; full_name?: string | null; email?: string | null; role?: string | null };
      profileById.set(row.id, {
        full_name: row.full_name ?? null,
        email: row.email ?? null,
        role: row.role ?? null,
      });
    }
  }

  const enriched = (rows ?? []).map((r) => {
    const m = r as { id: string; sender_id: string; body: string; created_at: string };
    const prof = profileById.get(m.sender_id);
    const senderRole = prof?.role === "hotel" ? "hotel" : "guest";
    const senderName =
      prof?.full_name?.trim() ||
      prof?.email?.trim() ||
      (senderRole === "hotel" ? "Hotel" : "Guest");
    return {
      id: m.id,
      booking_id: bookingId,
      sender_id: m.sender_id,
      body: m.body,
      created_at: m.created_at,
      sender_role: senderRole,
      sender_name: senderName,
    };
  });

  res.json(enriched);
});

/** POST /api/bookings/:id/messages — send a message (guest or hotel for this booking). */
router.post("/bookings/:bookingId/messages", authenticate, async (req: Request, res): Promise<void> => {
  const rawBid = req.params.bookingId;
  const bookingId = Array.isArray(rawBid) ? rawBid[0] : rawBid;
  if (!bookingId) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  const userId = req.user!.sub;
  const role = req.user!.role;
  const raw = typeof req.body?.body === "string" ? req.body.body : "";
  const body = raw.trim();

  if (!body) {
    res.status(400).json({ error: "Message cannot be empty" });
    return;
  }
  if (body.length > MESSAGE_MAX_LEN) {
    res.status(400).json({ error: `Message must be at most ${MESSAGE_MAX_LEN} characters` });
    return;
  }

  const access = await assertBookingMessageAccess(userId, role, bookingId);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("booking_messages")
    .insert({
      booking_id: bookingId,
      sender_id: userId,
      body,
    })
    .select("id, booking_id, sender_id, body, created_at")
    .single();

  if (error || !inserted) {
    res.status(500).json({ error: error?.message ?? "Failed to send message" });
    return;
  }

  const ins = inserted as { id: string; sender_id: string; body: string; created_at: string };
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", ins.sender_id)
    .single();
  const p = prof as { full_name?: string | null; email?: string | null; role?: string | null } | null;
  const senderRole = p?.role === "hotel" ? "hotel" : "guest";
  const senderName =
    p?.full_name?.trim() || p?.email?.trim() || (senderRole === "hotel" ? "Hotel" : "Guest");

  const out = {
    id: ins.id,
    booking_id: bookingId,
    sender_id: ins.sender_id,
    body: ins.body,
    created_at: ins.created_at,
    sender_role: senderRole,
    sender_name: senderName,
  };

  try {
    emitBookingMessage(bookingId, out);
    const { data: bRow } = await supabaseAdmin
      .from("bookings")
      .select("user_id, rooms!inner(hotel_id)")
      .eq("id", bookingId)
      .single();
    const br = bRow as
      | { user_id: string; rooms?: { hotel_id: string } | { hotel_id: string }[] }
      | null;
    if (br?.user_id) {
      const room = Array.isArray(br.rooms) ? br.rooms[0] : br.rooms;
      const hid = room?.hotel_id;
      if (hid) {
        await notifyNewChatMessage({
          bookingId,
          senderRole,
          guestUserId: br.user_id,
          hotelId: hid,
          preview: ins.body,
          senderName,
          senderId: ins.sender_id,
        });
      }
    }
  } catch (e) {
    console.warn("[realtime] message emit failed", e);
  }

  res.status(201).json(out);
});

function bookingRefFromId(id: string): string {
  const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `MST-${compact}`;
}

/** GET /api/bookings/:id/e-receipt — download system-generated e-receipt PDF (guest, paid bookings only). */
router.get(
  "/bookings/:id/e-receipt",
  authenticate,
  async (req: Request, res): Promise<void> => {
    if (req.user!.role !== "guest") {
      res.status(403).json({ error: "Only guests can download this e-receipt" });
      return;
    }
    const rawId = req.params.id;
    const bookingId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!bookingId) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }
    const userId = req.user!.sub;

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        `id, check_in, check_out, booking_type, total_amount, status, payment_status, payment_method, created_at,
        rooms!inner(name, room_type, hotels(id, name, address, currency))`
      )
      .eq("id", bookingId)
      .eq("user_id", userId)
      .single();

    if (error || !booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const b = booking as {
      check_in: string;
      check_out: string;
      booking_type: string;
      total_amount: string | number;
      status: string;
      payment_status: string;
      payment_method: string | null;
      created_at: string;
      rooms?: {
        name?: string | null;
        room_type?: string | null;
        hotels?: { name?: string | null; address?: string | null; currency?: string | null } | null;
      } | null;
    };

    const ps = String(b.payment_status ?? "").toLowerCase();
    if (ps !== "paid") {
      res.status(400).json({
        error: "E-receipts are available only after payment is marked as paid.",
      });
      return;
    }

    const roomRaw = b.rooms;
    const room = roomRaw && (Array.isArray(roomRaw) ? roomRaw[0] : roomRaw);
    const h = room?.hotels;
    const hotel = h && (Array.isArray(h) ? h[0] : h);
    const hotelName = hotel?.name?.trim() || "Hotel";
    const hotelAddress = hotel?.address ?? null;
    const currency = hotel?.currency ?? null;
    const roomName = room?.name?.trim() || "Room";
    const roomType = room?.room_type ?? null;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();
    const prof = profile as { full_name?: string | null; email?: string | null } | null;

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = prof?.email ?? authUser?.user?.email ?? null;

    const { checkIn, checkOut, issuedAtLabel } = formatReceiptLabels(
      b.check_in,
      b.check_out,
      new Date().toISOString()
    );

    const bookingTypeLabel =
      String(b.booking_type).toLowerCase() === "hourly" ? "Hourly (micro-stay)" : "Nightly";

    pipeBookingEreceiptPdf(res, {
      bookingRef: bookingRefFromId(bookingId),
      guestName: prof?.full_name ?? null,
      guestEmail: email,
      hotelName,
      hotelAddress,
      roomName,
      roomType,
      bookingType: bookingTypeLabel,
      checkIn,
      checkOut,
      totalAmountLabel: formatReceiptAmount(b.total_amount, currency),
      paymentMethod: paymentMethodLabel(b.payment_method),
      bookingStatus: String(b.status ?? "—").toUpperCase(),
      paymentStatus: String(b.payment_status ?? "—").toUpperCase(),
      issuedAtLabel,
    });
  }
);

/** GET /api/bookings/:id — single booking detail for the authenticated guest (own booking only). */
router.get(
  "/bookings/:id",
  authenticate,
  async (req: Request, res): Promise<void> => {
    const rawId = req.params.id;
    const bookingId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!bookingId) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }
    const userId = req.user!.sub;

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        `*, rooms(
          id, name, hotel_id, description, room_type, base_price_night, capacity, amenities, media,
          bathroom_count, bathroom_shared, offer_hourly, hourly_rate
        )`
      )
      .eq("id", bookingId)
      .eq("user_id", userId)
      .single();

    if (bookingError || !booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const roomRow = bookingDetailRoomRow((booking as { rooms?: unknown }).rooms);
    const hotelId = (roomRow?.hotel_id as string | undefined) ?? undefined;

    let hotel: {
      id: string;
      name: string;
      address: string;
      check_in_time: string | null;
      check_out_time: string | null;
    } | null = null;
    if (hotelId) {
      const { data: hotelRow } = await supabaseAdmin
        .from("hotels")
        .select("id, name, address, check_in_time, check_out_time")
        .eq("id", hotelId)
        .single();
      if (hotelRow)
        hotel = hotelRow as {
          id: string;
          name: string;
          address: string;
          check_in_time: string | null;
          check_out_time: string | null;
        };
    }

    let room: Record<string, unknown> | null = null;
    if (roomRow) {
      const media_urls = await signedRoomMediaUrls(roomRow.media);
      const { media: _omitMedia, ...rest } = roomRow;
      room = { ...rest, hotels: hotel, media_urls };
    }

    const b = booking as { check_out: string; status: string; id: string };
    const checkOutPast = new Date(b.check_out) <= new Date();
    const stayFinished = ["confirmed", "completed"].includes(b.status) && checkOutPast;

    let existingReview: { rating: number; comment: string | null; created_at: string } | null = null;
    let canReview = false;
    let reviewBlockReason: string | null = null;

    const { data: reviewRow } = await supabaseAdmin
      .from("reviews")
      .select("rating, comment, created_at")
      .eq("booking_id", bookingId)
      .single();

    if (reviewRow) {
      existingReview = reviewRow as { rating: number; comment: string | null; created_at: string };
    } else if (stayFinished && room?.id && hotelId) {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
      const { data: sameMonthReviews } = await supabaseAdmin
        .from("reviews")
        .select("booking_id")
        .eq("user_id", userId)
        .gte("created_at", thisMonthStart)
        .lte("created_at", thisMonthEnd);

      const monthBids = (sameMonthReviews ?? []).map((r) =>
        String((r as { booking_id: string }).booking_id)
      );
      let sameHotelThisMonth = false;
      if (monthBids.length > 0) {
        const { data: bkRows } = await supabaseAdmin
          .from("bookings")
          .select("room_id")
          .in("id", monthBids);
        const roomIds = [
          ...new Set(
            (bkRows ?? [])
              .map((x) => (x as { room_id?: string }).room_id)
              .filter((id): id is string => typeof id === "string" && id.length > 0)
          ),
        ];
        if (roomIds.length > 0) {
          const { data: roomsData } = await supabaseAdmin
            .from("rooms")
            .select("hotel_id")
            .in("id", roomIds);
          sameHotelThisMonth = (roomsData ?? []).some(
            (row) => (row as { hotel_id?: string }).hotel_id === hotelId
          );
        }
      }
      if (sameHotelThisMonth) {
        reviewBlockReason =
          "You can only rate each property once per month. Try again next month.";
      } else {
        canReview = true;
      }
    } else if (!["confirmed", "completed"].includes(b.status)) {
      reviewBlockReason = "You can rate this stay after your booking is confirmed.";
    } else if (!checkOutPast) {
      reviewBlockReason = "You can rate this stay after your check-out date.";
    }

    const out = {
      ...booking,
      rooms: room ?? undefined,
      can_review: canReview,
      existing_review: existingReview,
      review_block_reason: reviewBlockReason,
    };
    res.json(out);
  }
);

/** POST /api/bookings/:id/payment-receipt — guest re-uploads payment receipt after hotel rejected proof. */
router.post(
  "/bookings/:id/payment-receipt",
  authenticate,
  upload.single("receipt"),
  async (req: Request, res): Promise<void> => {
    if (!req.supabaseAccessToken) {
      res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
      return;
    }
    const rawId = req.params.id;
    const bookingId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!bookingId) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }
    const userId = req.user!.sub;
    const receiptFile = req.file;
    if (!receiptFile || !/^image\//.test(receiptFile.mimetype)) {
      res.status(400).json({ error: "An image receipt file is required" });
      return;
    }

    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { data: booking, error: fetchError } = await db
      .from("bookings")
      .select("id, user_id, status, payment_status, payment_method, payment_receipt_path, payment_rejection_note")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if ((booking as { user_id: string }).user_id !== userId) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }

    const b = booking as {
      status: string;
      payment_status: string;
      payment_method?: string | null;
      payment_receipt_path?: string | null;
      payment_rejection_note?: string | null;
    };
    if (b.payment_receipt_path && !b.payment_rejection_note) {
      res.status(400).json({
        error: "A receipt is already on file. Wait for the hotel to verify it.",
      });
      return;
    }
    if (b.status !== "confirmed") {
      res.status(400).json({ error: "Booking must be confirmed before uploading a receipt" });
      return;
    }
    if (b.payment_status !== "pending") {
      res.status(400).json({ error: "Payment is not awaiting a receipt" });
      return;
    }
    if ((b.payment_method ?? "").toLowerCase() !== "online") {
      res.status(400).json({ error: "This booking is not an online payment booking" });
      return;
    }

    const ext = receiptFile.mimetype.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
    const filePath = `booking-receipts/${bookingId}/receipt.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("hotel-assets")
      .upload(filePath, receiptFile.buffer, { contentType: receiptFile.mimetype, upsert: true });
    if (uploadError) {
      res.status(500).json({ error: uploadError.message ?? "Failed to upload receipt" });
      return;
    }

    const { data: updated, error: updateError } = await db
      .from("bookings")
      .update({
        payment_receipt_path: filePath,
        payment_rejection_note: null,
      })
      .eq("id", bookingId)
      .select("*")
      .single();

    if (updateError) {
      res.status(500).json({ error: updateError.message ?? "Failed to save receipt" });
      return;
    }
    try {
      const roomId = (updated as { room_id: string }).room_id;
      const { data: roomRow } = await supabaseAdmin
        .from("rooms")
        .select("hotel_id")
        .eq("id", roomId)
        .single();
      const hid = (roomRow as { hotel_id?: string } | null)?.hotel_id;
      if (hid) {
        notifyHotelReceiptUploaded(hid, bookingId);
      }
    } catch (e) {
      console.warn("[realtime] notifyHotelReceiptUploaded failed", e);
    }
    res.status(200).json(updated);
  }
);

/** POST /api/bookings/:id/review — submit rating for a completed stay (once per property per calendar month). */
router.post(
  "/bookings/:id/review",
  authenticate,
  async (req: Request, res): Promise<void> => {
    const rawId = req.params.id;
    const bookingId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!bookingId) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }
    const userId = req.user!.sub;
    const { rating, comment } = req.body as { rating?: number; comment?: string | null };

    if (rating == null || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: "Rating is required and must be between 1 and 5" });
      return;
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, user_id, status, check_out, room_id")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (booking.user_id !== userId) {
      res.status(403).json({ error: "Cannot review this booking" });
      return;
    }

    const statusOk = ["confirmed", "completed"].includes(booking.status);
    const checkOutPast = new Date(booking.check_out) <= new Date();
    if (!statusOk || !checkOutPast) {
      res.status(400).json({ error: "You can only review a stay after check-out" });
      return;
    }

    const { data: existing } = await supabaseAdmin
      .from("reviews")
      .select("id")
      .eq("booking_id", bookingId)
      .single();

    if (existing) {
      res.status(400).json({ error: "You have already submitted a review for this booking" });
      return;
    }

    const { data: roomInfo } = await supabaseAdmin
      .from("rooms")
      .select("hotel_id")
      .eq("id", (booking as { room_id: string }).room_id)
      .single();
    const targetHotelId = (roomInfo as { hotel_id?: string } | null)?.hotel_id;
    if (!targetHotelId) {
      res.status(500).json({ error: "Room configuration error" });
      return;
    }

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const { data: sameMonthReviews } = await supabaseAdmin
      .from("reviews")
      .select("booking_id")
      .eq("user_id", userId)
      .gte("created_at", thisMonthStart)
      .lte("created_at", thisMonthEnd);

    const priorBookingIds = (sameMonthReviews ?? []).map((r) =>
      String((r as { booking_id: string }).booking_id)
    );
    let sameHotelThisMonth = false;
    if (priorBookingIds.length > 0) {
      const { data: bookingsForReviews } = await supabaseAdmin
        .from("bookings")
        .select("room_id")
        .in("id", priorBookingIds);
      const roomIds = [
        ...new Set(
          (bookingsForReviews ?? [])
            .map((x) => (x as { room_id?: string }).room_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      ];
      if (roomIds.length > 0) {
        const { data: roomsData } = await supabaseAdmin
          .from("rooms")
          .select("hotel_id")
          .in("id", roomIds);
        sameHotelThisMonth = (roomsData ?? []).some(
          (row) => (row as { hotel_id?: string }).hotel_id === targetHotelId
        );
      }
    }
    if (sameHotelThisMonth) {
      res.status(400).json({
        error: "You can only rate each property once per month. Try again next month.",
      });
      return;
    }

    const { data: review, error: insertError } = await supabaseAdmin
      .from("reviews")
      .insert({
        booking_id: bookingId,
        user_id: userId,
        rating: Number(rating),
        comment: comment != null && String(comment).trim() !== "" ? String(comment).trim() : null,
      })
      .select("*")
      .single();

    if (insertError) {
      res.status(500).json({ error: insertError.message ?? "Failed to submit review" });
      return;
    }

    res.status(201).json(review);
  }
);

router.patch(
  "/bookings/:id/cancel",
  authenticate,
  async (req: Request, res): Promise<void> => {
    const bookingId = req.params.id;
    const userId = req.user!.sub;

    const { data: booking, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select("id, user_id, status")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (booking.user_id !== userId) {
      res.status(403).json({ error: "Cannot cancel this booking" });
      return;
    }

    if (booking.status !== "pending") {
      res.status(400).json({ error: "Only pending bookings can be cancelled" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled", payment_status: "cancelled" })
      .eq("id", bookingId)
      .select("*")
      .single();

    if (error || !data) {
      res.status(500).json({ error: "Failed to cancel booking" });
      return;
    }

    res.json(data);
  }
);

export default router;

