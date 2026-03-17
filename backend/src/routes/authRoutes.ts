import { Router } from "express";
import { supabaseAdmin, supabaseClient } from "../config/supabaseClient";
import { signToken } from "../middleware/auth";

const router = Router();

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
