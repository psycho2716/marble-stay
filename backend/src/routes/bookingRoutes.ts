import { Router } from "express";
import type { Request } from "express";
import { supabaseClient, createSupabaseClientForUser } from "../config/supabaseClient";
import { authenticate } from "../middleware/auth";

const router = Router();

router.post(
  "/bookings",
  authenticate,
  async (req: Request, res): Promise<void> => {
    if (!req.supabaseAccessToken) {
      res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
      return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const { room_id, check_in, check_out, booking_type, hours } = req.body;

    if (!room_id || !check_in || !check_out) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const userId = req.user!.sub;

    const effectiveType = booking_type === "hourly" ? "hourly" : "nightly";

    const { data: room, error: roomError } = await supabaseClient
      .from("rooms")
      .select("id, base_price_night, hourly_rate")
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

      if (!slots || slots.length !== hours.length || slots.some((s) => !s.available)) {
        res.status(400).json({ error: "One or more hours not available" });
        return;
      }

      if (!room.hourly_rate) {
        res.status(400).json({ error: "Room has no hourly rate configured" });
        return;
      }

      totalAmount = hours.length * Number(room.hourly_rate);
    }

    const { data: booking, error: bookingError } = await db
      .from("bookings")
      .insert({
        user_id: userId,
        room_id,
        check_in,
        check_out,
        booking_type: effectiveType,
        total_amount: totalAmount,
        status: "pending",
        payment_status: "pending"
      })
      .select("*")
      .single();

    if (bookingError || !booking) {
      res.status(500).json({ error: "Failed to create booking" });
      return;
    }

    res.status(201).json(booking);
  }
);

router.get(
  "/bookings",
  authenticate,
  async (req: Request, res): Promise<void> => {
    if (!req.supabaseAccessToken) {
      res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
      return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);

    const { data, error } = await db
      .from("bookings")
      .select("*")
      .eq("user_id", req.user!.sub)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: "Failed to load bookings" });
      return;
    }

    res.json(data);
  }
);

router.patch(
  "/bookings/:id/cancel",
  authenticate,
  async (req: Request, res): Promise<void> => {
    if (!req.supabaseAccessToken) {
      res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
      return;
    }
    const db = createSupabaseClientForUser(req.supabaseAccessToken);
    const bookingId = req.params.id;

    const { data: booking, error: fetchError } = await db
      .from("bookings")
      .select("id, user_id, status")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (booking.user_id !== req.user!.sub) {
      res.status(403).json({ error: "Cannot cancel this booking" });
      return;
    }

    if (booking.status !== "pending" && booking.status !== "confirmed") {
      res.status(400).json({ error: "Booking cannot be cancelled" });
      return;
    }

    const { data, error } = await db
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

