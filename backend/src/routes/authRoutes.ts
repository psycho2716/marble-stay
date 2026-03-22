import { Router } from "express";
import { supabaseAdmin, supabaseClient } from "../config/supabaseClient";
import { authenticate, signToken } from "../middleware/auth";

const router = Router();

/** GET /api/auth/me — current user info (email, full_name, role) for profile display. */
router.get("/me", authenticate, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(req.user!.sub);
        const user = data?.user;
        if (error || !user) {
            return res.status(404).json({ error: "User not found" });
        }
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", req.user!.sub)
            .single();
        res.json({
            id: user.id,
            email: user.email ?? null,
            full_name: profile?.full_name ?? null,
            role: req.user!.role,
        });
    } catch {
        res.status(500).json({ error: "Failed to load profile" });
    }
});

/** PATCH /api/auth/profile — update current user's profile (e.g. full_name). Guest and hotel. */
router.patch("/profile", authenticate, async (req, res) => {
    const { full_name } = req.body as { full_name?: string | null };
    const trimmed = full_name != null ? (full_name === "" ? null : full_name.trim()) : undefined;
    try {
        const updates: { full_name?: string | null; updated_at: string } = {
            updated_at: new Date().toISOString(),
        };
        if (trimmed !== undefined) updates.full_name = trimmed;
        const { error } = await supabaseAdmin
            .from("profiles")
            .update(updates)
            .eq("id", req.user!.sub);
        if (error) {
            return res.status(400).json({ error: error.message ?? "Failed to update profile" });
        }
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", req.user!.sub)
            .single();
        res.json({ full_name: profile?.full_name ?? null });
    } catch {
        res.status(500).json({ error: "Failed to update profile" });
    }
});

/** POST /api/auth/change-password — change password (current + new). Guest and hotel. */
router.post("/change-password", authenticate, async (req, res) => {
    const { current_password, new_password } = req.body as {
        current_password?: string;
        new_password?: string;
    };
    if (!current_password || typeof current_password !== "string" || !current_password.trim()) {
        return res.status(400).json({ error: "Current password is required" });
    }
    if (!new_password || typeof new_password !== "string" || new_password.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters" });
    }
    try {
        const { data: userData, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(req.user!.sub);
        const user = userData?.user;
        if (fetchError || !user?.email) {
            return res.status(404).json({ error: "User not found" });
        }
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
            email: user.email,
            password: current_password,
        });
        if (signInError) {
            return res.status(400).json({ error: "Current password is incorrect" });
        }
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(req.user!.sub, {
            password: new_password,
        });
        if (updateError) {
            return res.status(400).json({ error: updateError.message ?? "Failed to update password" });
        }
        res.json({ message: "Password updated successfully" });
    } catch {
        res.status(500).json({ error: "Failed to change password" });
    }
});

/** POST /api/auth/delete-account — delete current user's account after password confirmation. */
router.post("/delete-account", authenticate, async (req, res) => {
    const current_password = typeof req.body?.current_password === "string" ? req.body.current_password.trim() : "";
    if (!current_password) {
        return res.status(400).json({ error: "Current password is required to confirm account deletion" });
    }
    const id = req.user!.sub;
    try {
        const { data: userData, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(id);
        const user = userData?.user;
        if (fetchError || !user?.email) {
            return res.status(404).json({ error: "User not found" });
        }
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
            email: user.email,
            password: current_password,
        });
        if (signInError) {
            return res.status(400).json({ error: "Current password is incorrect" });
        }
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id, role, hotel_id")
            .eq("id", id)
            .single();
        if (!profile) {
            return res.status(404).json({ error: "Profile not found" });
        }
        if (profile.role === "admin") {
            return res.status(403).json({ error: "Cannot delete admin account" });
        }
        const hotelId = profile.hotel_id as string | null | undefined;
        if (hotelId) {
            const { data: roomRows } = await supabaseAdmin.from("rooms").select("id").eq("hotel_id", hotelId);
            const roomIds = (roomRows ?? []).map((r) => r.id);
            if (roomIds.length > 0) {
                const { error: bookingsErr } = await supabaseAdmin.from("bookings").delete().in("room_id", roomIds);
                if (bookingsErr) {
                    return res.status(500).json({ error: bookingsErr.message ?? "Failed to delete hotel bookings" });
                }
            }
            const { error: payErr } = await supabaseAdmin.from("hotel_payment_methods").delete().eq("hotel_id", hotelId);
            if (payErr) {
                return res.status(500).json({ error: payErr.message ?? "Failed to delete payment methods" });
            }
            const { error: roomsErr } = await supabaseAdmin.from("rooms").delete().eq("hotel_id", hotelId);
            if (roomsErr) {
                return res.status(500).json({ error: roomsErr.message ?? "Failed to delete rooms" });
            }
            const { error: hotelErr } = await supabaseAdmin.from("hotels").delete().eq("id", hotelId);
            if (hotelErr) {
                return res.status(500).json({ error: hotelErr.message ?? "Failed to delete hotel" });
            }
        }
        const { error: reviewsErr } = await supabaseAdmin.from("reviews").delete().eq("user_id", id);
        if (reviewsErr) {
            return res.status(500).json({ error: reviewsErr.message ?? "Failed to delete reviews" });
        }
        const { error: bookingsErr } = await supabaseAdmin.from("bookings").delete().eq("user_id", id);
        if (bookingsErr) {
            return res.status(500).json({ error: bookingsErr.message ?? "Failed to delete bookings" });
        }
        const { error: prefsErr } = await supabaseAdmin.from("user_preferences").delete().eq("user_id", id);
        if (prefsErr) {
            return res.status(500).json({ error: prefsErr.message ?? "Failed to delete preferences" });
        }
        const { error: profileErr } = await supabaseAdmin.from("profiles").delete().eq("id", id);
        if (profileErr) {
            return res.status(500).json({ error: profileErr.message ?? "Failed to delete profile" });
        }
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
        if (deleteError) {
            return res.status(500).json({ error: deleteError.message ?? "Failed to delete account" });
        }
        res.status(204).send();
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to delete account" });
    }
});

// Admin client only for createUser (no Supabase session exists yet).
router.post("/register", async (req, res) => {
    const { email, password, full_name } = req.body;
    const role = "guest";

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role }
    });

    if (error || !data.user) {
        res.status(400).json({ error: error?.message ?? "Unable to register" });
        return;
    }

    const token = signToken({ sub: data.user.id, role });
    res.status(201).json({ token });
});

// Use anon client for sign-in; return Supabase access_token for user-scoped API calls.
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error || !data.user) {
        console.log(error?.message);
        res.status(401).json({ error: "Invalid credentials" });
        return;
    }

    const userId = data.user.id;
    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

    const role = (profile?.role as string) || (data.user.user_metadata?.role as string) || "guest";
    const roleTyped = role as "guest" | "hotel" | "admin";
    const token = signToken({ sub: userId, role: roleTyped });

    res.json({
        token,
        supabase_access_token: data.session?.access_token ?? undefined,
        role: roleTyped
    });
});

export default router;
