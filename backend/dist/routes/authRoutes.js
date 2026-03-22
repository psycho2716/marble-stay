"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const supabaseClient_1 = require("../config/supabaseClient");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const ALLOWED_GENDER = [
    "prefer_not_to_say",
    "male",
    "female",
    "non_binary",
    "other",
];
function trimToNull(v) {
    if (v == null)
        return null;
    const s = String(v).trim();
    return s === "" ? null : s;
}
/** undefined = omit field; null = clear in DB */
function optionalTrimmedString(body, key) {
    if (!(key in body))
        return undefined;
    return trimToNull(body[key]);
}
function parseGenderInput(raw) {
    if (raw === undefined)
        return undefined;
    if (raw === null || raw === "")
        return null;
    const s = String(raw).trim();
    if (s === "")
        return null;
    return ALLOWED_GENDER.includes(s) ? s : "invalid";
}
function parseDateOfBirthInput(raw) {
    if (raw === undefined)
        return { kind: "omit" };
    if (raw === null || raw === "")
        return { kind: "set", value: null };
    const s = String(raw).trim();
    if (s === "")
        return { kind: "set", value: null };
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) {
        return { kind: "error", message: "Date of birth must be YYYY-MM-DD" };
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(y, mo - 1, day);
    if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) {
        return { kind: "error", message: "Invalid date of birth" };
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (d > today) {
        return { kind: "error", message: "Date of birth cannot be in the future" };
    }
    if (y < 1900) {
        return { kind: "error", message: "Date of birth is not valid" };
    }
    return { kind: "set", value: s };
}
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
});
function guestAvatarPublicUrl(path) {
    if (!path)
        return null;
    const { data } = supabaseClient_1.supabaseAdmin.storage.from("guest-assets").getPublicUrl(path);
    return data?.publicUrl ?? null;
}
/** GET /api/auth/me — current user info for profile display. */
router.get("/me", auth_1.authenticate, async (req, res) => {
    try {
        const { data, error } = await supabaseClient_1.supabaseAdmin.auth.admin.getUserById(req.user.sub);
        const user = data?.user;
        if (error || !user) {
            return res.status(404).json({ error: "User not found" });
        }
        const { data: profile } = await supabaseClient_1.supabaseAdmin
            .from("profiles")
            .select("full_name, phone, country, avatar_path, guest_onboarding_completed, address_line, city, region, postal_code, gender, date_of_birth")
            .eq("id", req.user.sub)
            .single();
        const avatar_path = profile?.avatar_path ?? null;
        const prof = profile;
        const guestOnboardingDone = req.user.role !== "guest" || Boolean(prof?.guest_onboarding_completed);
        res.json({
            id: user.id,
            email: user.email ?? null,
            full_name: profile?.full_name ?? null,
            phone: profile?.phone ?? null,
            country: profile?.country ?? null,
            address_line: profile?.address_line ?? null,
            city: profile?.city ?? null,
            region: profile?.region ?? null,
            postal_code: profile?.postal_code ?? null,
            gender: profile?.gender ?? null,
            date_of_birth: profile?.date_of_birth ?? null,
            avatar_path,
            avatar_url: guestAvatarPublicUrl(avatar_path),
            role: req.user.role,
            guest_onboarding_completed: guestOnboardingDone,
            needs_onboarding: req.user.role === "guest" && !guestOnboardingDone,
        });
    }
    catch {
        res.status(500).json({ error: "Failed to load profile" });
    }
});
/** PATCH /api/auth/profile — update current user's profile (full_name; guests: contact, address, demographics, clear avatar). */
router.patch("/profile", auth_1.authenticate, async (req, res) => {
    const body = req.body;
    const { full_name, clear_avatar } = body;
    const trimmedName = full_name != null ? (full_name === "" ? null : String(full_name).trim()) : undefined;
    const id = req.user.sub;
    try {
        const updates = {
            updated_at: new Date().toISOString(),
        };
        if (trimmedName !== undefined)
            updates.full_name = trimmedName;
        const phoneOpt = optionalTrimmedString(body, "phone");
        if (phoneOpt !== undefined)
            updates.phone = phoneOpt;
        const countryOpt = optionalTrimmedString(body, "country");
        if (countryOpt !== undefined)
            updates.country = countryOpt;
        const addressLineOpt = optionalTrimmedString(body, "address_line");
        if (addressLineOpt !== undefined)
            updates.address_line = addressLineOpt;
        const cityOpt = optionalTrimmedString(body, "city");
        if (cityOpt !== undefined)
            updates.city = cityOpt;
        const regionOpt = optionalTrimmedString(body, "region");
        if (regionOpt !== undefined)
            updates.region = regionOpt;
        const postalOpt = optionalTrimmedString(body, "postal_code");
        if (postalOpt !== undefined)
            updates.postal_code = postalOpt;
        const genderParsed = parseGenderInput(body.gender);
        if (genderParsed === "invalid") {
            return res.status(400).json({ error: "Invalid gender value" });
        }
        if (genderParsed !== undefined)
            updates.gender = genderParsed;
        const dobParsed = parseDateOfBirthInput(body.date_of_birth);
        if (dobParsed.kind === "error") {
            return res.status(400).json({ error: dobParsed.message });
        }
        if (dobParsed.kind === "set")
            updates.date_of_birth = dobParsed.value;
        if (clear_avatar === true) {
            const { data: prev } = await supabaseClient_1.supabaseAdmin
                .from("profiles")
                .select("avatar_path")
                .eq("id", id)
                .single();
            const oldPath = prev?.avatar_path;
            if (oldPath) {
                await supabaseClient_1.supabaseAdmin.storage.from("guest-assets").remove([oldPath]);
            }
            updates.avatar_path = null;
        }
        const { error } = await supabaseClient_1.supabaseAdmin.from("profiles").update(updates).eq("id", id);
        if (error) {
            return res.status(400).json({ error: error.message ?? "Failed to update profile" });
        }
        const { data: profile } = await supabaseClient_1.supabaseAdmin
            .from("profiles")
            .select("full_name, phone, country, avatar_path, address_line, city, region, postal_code, gender, date_of_birth")
            .eq("id", id)
            .single();
        const avatar_path = profile?.avatar_path ?? null;
        res.json({
            full_name: profile?.full_name ?? null,
            phone: profile?.phone ?? null,
            country: profile?.country ?? null,
            address_line: profile?.address_line ?? null,
            city: profile?.city ?? null,
            region: profile?.region ?? null,
            postal_code: profile?.postal_code ?? null,
            gender: profile?.gender ?? null,
            date_of_birth: profile?.date_of_birth ?? null,
            avatar_path,
            avatar_url: guestAvatarPublicUrl(avatar_path),
        });
    }
    catch {
        res.status(500).json({ error: "Failed to update profile" });
    }
});
/** POST /api/auth/guest/profile-image — guest profile photo (JPG/PNG/WebP/GIF, max 2MB). */
router.post("/guest/profile-image", auth_1.authenticate, (0, auth_1.requireRole)("guest"), upload.single("profile_image"), async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: "No file uploaded. Send profile_image." });
    }
    if (!file.mimetype?.startsWith("image/")) {
        return res.status(400).json({ error: "File must be an image (JPEG, PNG, WebP, GIF)." });
    }
    const id = req.user.sub;
    const ext = file.mimetype === "image/png"
        ? "png"
        : file.mimetype === "image/webp"
            ? "webp"
            : file.mimetype === "image/gif"
                ? "gif"
                : "jpg";
    const filePath = `avatars/${id}/avatar.${ext}`;
    const { data: prev } = await supabaseClient_1.supabaseAdmin
        .from("profiles")
        .select("avatar_path")
        .eq("id", id)
        .single();
    const oldPath = prev?.avatar_path;
    if (oldPath && oldPath !== filePath) {
        await supabaseClient_1.supabaseAdmin.storage.from("guest-assets").remove([oldPath]);
    }
    const { error: uploadError } = await supabaseClient_1.supabaseAdmin.storage
        .from("guest-assets")
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) {
        return res.status(500).json({ error: uploadError.message ?? "Failed to upload image" });
    }
    const { error: updateError } = await supabaseClient_1.supabaseAdmin
        .from("profiles")
        .update({ avatar_path: filePath, updated_at: new Date().toISOString() })
        .eq("id", id);
    if (updateError) {
        return res.status(500).json({ error: updateError.message ?? "Failed to save profile image" });
    }
    res.json({
        avatar_path: filePath,
        avatar_url: guestAvatarPublicUrl(filePath),
        message: "Profile image updated.",
    });
});
/** POST /api/auth/guest/complete-onboarding — mark guest onboarding done after preferences are saved. */
router.post("/guest/complete-onboarding", auth_1.authenticate, (0, auth_1.requireRole)("guest"), async (req, res) => {
    const id = req.user.sub;
    const { data: prefs } = await supabaseClient_1.supabaseAdmin
        .from("user_preferences")
        .select("budget_min, budget_max, travel_needs, hotel_preferences, amenities")
        .eq("user_id", id)
        .single();
    const amenities = Array.isArray(prefs?.amenities) ? prefs.amenities : [];
    const hasContent = prefs?.budget_min != null ||
        prefs?.budget_max != null ||
        (typeof prefs?.travel_needs === "string" && prefs.travel_needs.trim().length > 0) ||
        (typeof prefs?.hotel_preferences === "string" && prefs.hotel_preferences.trim().length > 0) ||
        amenities.length > 0;
    if (!hasContent) {
        return res.status(400).json({
            error: "Add at least one preference (budget, interests, or notes) before continuing.",
        });
    }
    const { error } = await supabaseClient_1.supabaseAdmin
        .from("profiles")
        .update({ guest_onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq("id", id);
    if (error) {
        return res.status(500).json({ error: error.message ?? "Failed to complete onboarding" });
    }
    res.json({ guest_onboarding_completed: true, needs_onboarding: false });
});
/** POST /api/auth/change-password — change password (current + new). Guest and hotel. */
router.post("/change-password", auth_1.authenticate, async (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || typeof current_password !== "string" || !current_password.trim()) {
        return res.status(400).json({ error: "Current password is required" });
    }
    if (!new_password || typeof new_password !== "string" || new_password.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters" });
    }
    try {
        const { data: userData, error: fetchError } = await supabaseClient_1.supabaseAdmin.auth.admin.getUserById(req.user.sub);
        const user = userData?.user;
        if (fetchError || !user?.email) {
            return res.status(404).json({ error: "User not found" });
        }
        const { error: signInError } = await supabaseClient_1.supabaseClient.auth.signInWithPassword({
            email: user.email,
            password: current_password,
        });
        if (signInError) {
            return res.status(400).json({ error: "Current password is incorrect" });
        }
        const { error: updateError } = await supabaseClient_1.supabaseAdmin.auth.admin.updateUserById(req.user.sub, {
            password: new_password,
        });
        if (updateError) {
            return res.status(400).json({ error: updateError.message ?? "Failed to update password" });
        }
        res.json({ message: "Password updated successfully" });
    }
    catch {
        res.status(500).json({ error: "Failed to change password" });
    }
});
/** POST /api/auth/delete-account — delete current user's account after password confirmation. */
router.post("/delete-account", auth_1.authenticate, async (req, res) => {
    const current_password = typeof req.body?.current_password === "string" ? req.body.current_password.trim() : "";
    if (!current_password) {
        return res.status(400).json({ error: "Current password is required to confirm account deletion" });
    }
    const id = req.user.sub;
    try {
        const { data: userData, error: fetchError } = await supabaseClient_1.supabaseAdmin.auth.admin.getUserById(id);
        const user = userData?.user;
        if (fetchError || !user?.email) {
            return res.status(404).json({ error: "User not found" });
        }
        const { error: signInError } = await supabaseClient_1.supabaseClient.auth.signInWithPassword({
            email: user.email,
            password: current_password,
        });
        if (signInError) {
            return res.status(400).json({ error: "Current password is incorrect" });
        }
        const { data: profile } = await supabaseClient_1.supabaseAdmin
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
        const hotelId = profile.hotel_id;
        if (hotelId) {
            const { data: roomRows } = await supabaseClient_1.supabaseAdmin.from("rooms").select("id").eq("hotel_id", hotelId);
            const roomIds = (roomRows ?? []).map((r) => r.id);
            if (roomIds.length > 0) {
                const { error: bookingsErr } = await supabaseClient_1.supabaseAdmin.from("bookings").delete().in("room_id", roomIds);
                if (bookingsErr) {
                    return res.status(500).json({ error: bookingsErr.message ?? "Failed to delete hotel bookings" });
                }
            }
            const { error: payErr } = await supabaseClient_1.supabaseAdmin.from("hotel_payment_methods").delete().eq("hotel_id", hotelId);
            if (payErr) {
                return res.status(500).json({ error: payErr.message ?? "Failed to delete payment methods" });
            }
            const { error: roomsErr } = await supabaseClient_1.supabaseAdmin.from("rooms").delete().eq("hotel_id", hotelId);
            if (roomsErr) {
                return res.status(500).json({ error: roomsErr.message ?? "Failed to delete rooms" });
            }
            const { error: hotelErr } = await supabaseClient_1.supabaseAdmin.from("hotels").delete().eq("id", hotelId);
            if (hotelErr) {
                return res.status(500).json({ error: hotelErr.message ?? "Failed to delete hotel" });
            }
        }
        const { error: reviewsErr } = await supabaseClient_1.supabaseAdmin.from("reviews").delete().eq("user_id", id);
        if (reviewsErr) {
            return res.status(500).json({ error: reviewsErr.message ?? "Failed to delete reviews" });
        }
        const { error: bookingsErr } = await supabaseClient_1.supabaseAdmin.from("bookings").delete().eq("user_id", id);
        if (bookingsErr) {
            return res.status(500).json({ error: bookingsErr.message ?? "Failed to delete bookings" });
        }
        const { error: prefsErr } = await supabaseClient_1.supabaseAdmin.from("user_preferences").delete().eq("user_id", id);
        if (prefsErr) {
            return res.status(500).json({ error: prefsErr.message ?? "Failed to delete preferences" });
        }
        const { error: profileErr } = await supabaseClient_1.supabaseAdmin.from("profiles").delete().eq("id", id);
        if (profileErr) {
            return res.status(500).json({ error: profileErr.message ?? "Failed to delete profile" });
        }
        const { error: deleteError } = await supabaseClient_1.supabaseAdmin.auth.admin.deleteUser(id);
        if (deleteError) {
            return res.status(500).json({ error: deleteError.message ?? "Failed to delete account" });
        }
        res.status(204).send();
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to delete account" });
    }
});
// Admin client only for createUser (no Supabase session exists yet).
router.post("/register", async (req, res) => {
    const body = req.body;
    const { email, password, full_name } = body;
    const role = "guest";
    const genderParsed = parseGenderInput(body.gender);
    if (genderParsed === "invalid") {
        res.status(400).json({ error: "Invalid gender value" });
        return;
    }
    const dobParsed = parseDateOfBirthInput(body.date_of_birth);
    if (dobParsed.kind === "error") {
        res.status(400).json({ error: dobParsed.message });
        return;
    }
    const { data, error } = await supabaseClient_1.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role }
    });
    if (error || !data.user) {
        res.status(400).json({ error: error?.message ?? "Unable to register" });
        return;
    }
    const profileUpdates = {};
    const extraKeys = ["phone", "country", "address_line", "city", "region", "postal_code"];
    for (const k of extraKeys) {
        const v = optionalTrimmedString(body, k);
        if (v !== undefined)
            profileUpdates[k] = v;
    }
    if (genderParsed !== undefined)
        profileUpdates.gender = genderParsed;
    if (dobParsed.kind === "set")
        profileUpdates.date_of_birth = dobParsed.value;
    if (Object.keys(profileUpdates).length > 0) {
        profileUpdates.updated_at = new Date().toISOString();
        const { error: profileUpdateError } = await supabaseClient_1.supabaseAdmin
            .from("profiles")
            .update(profileUpdates)
            .eq("id", data.user.id);
        if (profileUpdateError) {
            console.error("register profile extras:", profileUpdateError);
        }
    }
    const token = (0, auth_1.signToken)({ sub: data.user.id, role });
    res.status(201).json({ token });
});
// Use anon client for sign-in; return Supabase access_token for user-scoped API calls.
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabaseClient_1.supabaseClient.auth.signInWithPassword({
        email,
        password
    });
    if (error || !data.user) {
        console.log(error?.message);
        res.status(401).json({ error: "Invalid credentials" });
        return;
    }
    const userId = data.user.id;
    const { data: profile } = await supabaseClient_1.supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
    const role = profile?.role || data.user.user_metadata?.role || "guest";
    const roleTyped = role;
    const token = (0, auth_1.signToken)({ sub: userId, role: roleTyped });
    res.json({
        token,
        supabase_access_token: data.session?.access_token ?? undefined,
        role: roleTyped
    });
});
exports.default = router;
