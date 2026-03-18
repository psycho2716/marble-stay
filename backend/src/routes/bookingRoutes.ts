import { Router } from "express";
import type { Request } from "express";
import multer from "multer";
import { supabaseClient, supabaseAdmin, createSupabaseClientForUser } from "../config/supabaseClient";
import { authenticate } from "../middleware/auth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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
    const { room_id, check_in, check_out, booking_type, hours: hoursRaw, payment_method } = req.body as {
      room_id?: string;
      check_in?: string;
      check_out?: string;
      booking_type?: string;
      hours?: string | number[];
      payment_method?: string;
    };
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
      .select("id, base_price_night, hourly_rate, hourly_available_hours")
      .eq("id", room_id)
      .single();

    if (roomError || !room) {
      res.status(404).json({ error: "Room not found" });
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
        hourly_hours: effectiveType === "hourly" ? hours : null
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
    res.status(201).json(updated ?? booking);
  }
);

router.get(
  "/bookings",
  authenticate,
  async (req: Request, res): Promise<void> => {
    const userId = req.user!.sub;
    const db = req.supabaseAccessToken
      ? createSupabaseClientForUser(req.supabaseAccessToken)
      : supabaseAdmin;

    const { data, error } = await db
      .from("bookings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: "Failed to load bookings" });
      return;
    }

    res.json(data ?? []);
  }
);

/** GET /api/bookings/:id — single booking detail for the authenticated guest (own booking only). */
router.get(
  "/bookings/:id",
  authenticate,
  async (req: Request, res): Promise<void> => {
    const bookingId = req.params.id;
    const userId = req.user!.sub;

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("*, rooms(id, name, hotel_id)")
      .eq("id", bookingId)
      .eq("user_id", userId)
      .single();

    if (bookingError || !booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const room = (booking as { rooms?: { id: string; name: string; hotel_id: string } }).rooms;
    let hotel: { id: string; name: string; address: string } | null = null;
    if (room?.hotel_id) {
      const { data: hotelRow } = await supabaseAdmin
        .from("hotels")
        .select("id, name, address")
        .eq("id", room.hotel_id)
        .single();
      if (hotelRow) hotel = hotelRow as { id: string; name: string; address: string };
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
    } else if (stayFinished && room?.id) {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
      const { data: sameMonthReviews } = await supabaseAdmin
        .from("reviews")
        .select("id, bookings!inner(room_id)")
        .eq("user_id", userId)
        .gte("created_at", thisMonthStart)
        .lte("created_at", thisMonthEnd);

      const sameRoomThisMonth = (sameMonthReviews ?? []).some((r: unknown) => {
        const b = (r as { bookings?: { room_id: string } | { room_id: string }[] }).bookings;
        const roomId = Array.isArray(b) ? b[0]?.room_id : b?.room_id;
        return roomId === room.id;
      });
      if (sameRoomThisMonth) {
        reviewBlockReason = "You can only submit one review per room per month. Try again next month.";
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
      rooms: room ? { ...room, hotels: hotel } : undefined,
      can_review: canReview,
      existing_review: existingReview,
      review_block_reason: reviewBlockReason,
    };
    res.json(out);
  }
);

/** POST /api/bookings/:id/review — submit rating and feedback for a completed stay (once per room per month). */
router.post(
  "/bookings/:id/review",
  authenticate,
  async (req: Request, res): Promise<void> => {
    const bookingId = req.params.id;
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

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const { data: sameMonthReviews } = await supabaseAdmin
      .from("reviews")
      .select("id, booking_id")
      .eq("user_id", userId)
      .gte("created_at", thisMonthStart)
      .lte("created_at", thisMonthEnd);

    const bookingIds = (sameMonthReviews ?? []).map((r: { booking_id: string }) => r.booking_id);
    let sameRoomThisMonth = false;
    if (bookingIds.length > 0) {
      const { data: bookingsForReviews } = await supabaseAdmin
        .from("bookings")
        .select("id, room_id")
        .in("id", bookingIds);
      sameRoomThisMonth = (bookingsForReviews ?? []).some(
        (b: { room_id: string }) => b.room_id === (booking as { room_id: string }).room_id
      );
    }
    if (sameRoomThisMonth) {
      res.status(400).json({ error: "You can only submit one review per room per month. Try again next month." });
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
      .update({ status: "cancelled" })
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

