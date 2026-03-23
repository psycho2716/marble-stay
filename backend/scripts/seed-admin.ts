/**
 * Idempotent admin seeder using Supabase Admin API (works for local + hosted).
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/seed-admin.ts
 *
 * Optional env (defaults match supabase/seed.sql):
 *   ADMIN_SEED_EMAIL
 *   ADMIN_SEED_PASSWORD
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_KEY in .env
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_KEY?.trim();

const email = (process.env.ADMIN_SEED_EMAIL ?? "admin@marblestay.local").trim().toLowerCase();
const password = process.env.ADMIN_SEED_PASSWORD ?? "AdminChangeMe123!";

async function main(): Promise<void> {
    if (!url || !serviceKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment (.env).");
        process.exit(1);
    }

    const supabase = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: page1, error: listErr } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 200
    });

    if (listErr) {
        console.error("Failed to list users:", listErr.message);
        process.exit(1);
    }

    const existing = page1.users.find((u) => (u.email ?? "").toLowerCase() === email);

    if (existing) {
        const { error: upErr } = await supabase
            .from("profiles")
            .update({
                role: "admin",
                full_name: "System Admin",
                guest_onboarding_completed: true
            })
            .eq("id", existing.id);

        if (upErr) {
            console.error("Failed to update profile to admin:", upErr.message);
            process.exit(1);
        }

        const { error: metaErr } = await supabase.auth.admin.updateUserById(existing.id, {
            user_metadata: { full_name: "System Admin", role: "admin" }
        });

        if (metaErr) {
            console.warn("Profile set to admin; auth metadata update warning:", metaErr.message);
        }

        console.log(`Admin already present: ${email} — ensured profiles.role = admin.`);
        return;
    }

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "System Admin", role: "admin" }
    });

    if (createErr || !created.user) {
        console.error("createUser failed:", createErr?.message ?? "no user returned");
        process.exit(1);
    }

    const id = created.user.id;

    const { error: upErr } = await supabase
        .from("profiles")
        .update({
            role: "admin",
            full_name: "System Admin",
            guest_onboarding_completed: true
        })
        .eq("id", id);

    if (upErr) {
        console.error("User created but failed to set admin profile:", upErr.message);
        process.exit(1);
    }

    console.log(`Created admin: ${email} (change password after first login).`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
