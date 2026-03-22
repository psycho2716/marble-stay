"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabaseClient_1 = require("../config/supabaseClient");
const router = (0, express_1.Router)();
router.post("/payments/mark-paid", auth_1.authenticate, async (req, res) => {
    if (!req.supabaseAccessToken) {
        res.status(401).json({ error: "Supabase session required (send x-supabase-access-token)" });
        return;
    }
    const db = (0, supabaseClient_1.createSupabaseClientForUser)(req.supabaseAccessToken);
    const { booking_id } = req.body;
    if (!booking_id) {
        res.status(400).json({ error: "booking_id is required" });
        return;
    }
    const { data: booking, error: fetchError } = await db
        .from("bookings")
        .select("id, user_id, payment_status")
        .eq("id", booking_id)
        .single();
    if (fetchError || !booking) {
        res.status(404).json({ error: "Booking not found" });
        return;
    }
    if (booking.user_id !== req.user.sub) {
        res.status(403).json({ error: "Cannot update this booking" });
        return;
    }
    const { data, error } = await db
        .from("bookings")
        .update({ payment_status: "paid" })
        .eq("id", booking_id)
        .select("*")
        .single();
    if (error || !data) {
        res.status(500).json({ error: "Failed to mark booking as paid" });
        return;
    }
    res.json(data);
});
exports.default = router;
