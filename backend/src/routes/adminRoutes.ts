import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.use(authenticate, requireRole("admin"));

router.get("/admin/hotels", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to load hotels" });
    return;
  }

  res.json(data);
});

router.get("/admin/hotels/:id", async (req, res) => {
  const id = req.params.id;
  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Hotel not found" });
    return;
  }

  res.json(data);
});

/** GET /api/admin/hotels/:id/permit-url — signed URL to view business permit (admin only). */
router.get("/admin/hotels/:id/permit-url", async (req, res) => {
  const id = req.params.id;
  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("business_permit_file")
    .eq("id", id)
    .single();

  if (hotelError || !hotel?.business_permit_file) {
    res.status(404).json({ error: "No business permit on file" });
    return;
  }

  const path = hotel.business_permit_file;
  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from("hotel-assets")
    .createSignedUrl(path, 3600);

  if (signError || !signed?.signedUrl) {
    res.status(500).json({ error: "Could not generate document link" });
    return;
  }

  res.json({ url: signed.signedUrl });
});

router.patch("/admin/hotels/:id/verify", async (req, res) => {
  const id = req.params.id;
  const body = req.body ?? {};
  const permit_expires_at = body.permit_expires_at;
  const dateVal = permit_expires_at != null && String(permit_expires_at).trim() !== "" ? String(permit_expires_at).trim() : null;
  if (!dateVal) {
    res.status(400).json({ error: "Permit expiration date is required. Set 'Permit valid until' before verifying." });
    return;
  }
  const date = new Date(dateVal);
  if (Number.isNaN(date.getTime())) {
    res.status(400).json({ error: "Permit expiration date must be a valid date." });
    return;
  }

  const updates: { verification_status: string; permit_expires_at: string } = {
    verification_status: "verified",
    permit_expires_at: date.toISOString()
  };

  let result = await supabaseAdmin
    .from("hotels")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (result.error && (result.error.message?.includes("permit_expires_at") ?? result.error.message?.includes("schema cache"))) {
    result = await supabaseAdmin
      .from("hotels")
      .update({ verification_status: "verified" })
      .eq("id", id)
      .select("*")
      .single();
  }

  const { data, error } = result;
  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Failed to verify hotel" });
    return;
  }

  res.json(data);
});

router.patch("/admin/hotels/:id/reject", async (req, res) => {
  const id = req.params.id;
  let result = await supabaseAdmin
    .from("hotels")
    .update({ verification_status: "rejected", permit_expires_at: null })
    .eq("id", id)
    .select("*")
    .single();

  if (result.error && (result.error.message?.includes("permit_expires_at") ?? result.error.message?.includes("schema cache"))) {
    result = await supabaseAdmin
      .from("hotels")
      .update({ verification_status: "rejected" })
      .eq("id", id)
      .select("*")
      .single();
  }

  const { data, error } = result;
  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Failed to reject hotel" });
    return;
  }

  res.json(data);
});

/** PATCH /api/admin/hotels/:id/permit-expiry — set or update permit expiration (admin only). */
router.patch("/admin/hotels/:id/permit-expiry", async (req, res) => {
  const id = req.params.id;
  const { permit_expires_at } = req.body;
  const date = permit_expires_at ? new Date(permit_expires_at) : null;
  const value = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  const { data, error } = await supabaseAdmin
    .from("hotels")
    .update({ permit_expires_at: value })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    res.status(500).json({ error: "Failed to update permit expiry" });
    return;
  }
  res.json(data);
});

router.get("/admin/users", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, hotel_id, created_at")
    .neq("role", "admin")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to load users" });
    return;
  }

  res.json(data);
});

/** DELETE /api/admin/users/:id — delete user and all related data. Excludes admin. */
router.delete("/admin/users/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "User id required" });
    return;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role, email")
    .eq("id", id)
    .single();

  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (profile.role === "admin") {
    res.status(403).json({ error: "Cannot delete admin account" });
    return;
  }

  // Delete all public schema data linked to this user (FK-safe order).
  // Supabase auth.admin.deleteUser only removes auth.users; CASCADE may not run for GoTrue deletes.
  const { error: reviewsErr } = await supabaseAdmin
    .from("reviews")
    .delete()
    .eq("user_id", id);
  if (reviewsErr) {
    res.status(500).json({ error: reviewsErr.message || "Failed to delete user reviews" });
    return;
  }

  const { error: bookingsErr } = await supabaseAdmin
    .from("bookings")
    .delete()
    .eq("user_id", id);
  if (bookingsErr) {
    res.status(500).json({ error: bookingsErr.message || "Failed to delete user bookings" });
    return;
  }

  const { error: prefsErr } = await supabaseAdmin
    .from("user_preferences")
    .delete()
    .eq("user_id", id);
  if (prefsErr) {
    res.status(500).json({ error: prefsErr.message || "Failed to delete user preferences" });
    return;
  }

  const { error: profileErr } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", id);
  if (profileErr) {
    res.status(500).json({ error: profileErr.message || "Failed to delete user profile" });
    return;
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (deleteError) {
    res.status(500).json({ error: deleteError.message || "Failed to delete auth user" });
    return;
  }

  res.status(204).send();
});

export default router;

