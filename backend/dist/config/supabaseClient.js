"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseClient = exports.supabaseAdmin = void 0;
exports.createSupabaseClientForUser = createSupabaseClientForUser;
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !serviceKey) {
    console.warn("[Supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set");
}
/**
 * Admin client (service role). Use ONLY for:
 * - Admin panel operations (adminRoutes)
 * - auth.admin.createUser (guest/hotel registration)
 * - Hotel registration flow (createUser, insert hotel, update profile, storage upload)
 * All other operations should use supabaseClient or createSupabaseClientForUser.
 */
exports.supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl || "", serviceKey || "", {
    auth: { persistSession: false }
});
/** Anon client for public data and sign-in. RLS applies; no user context unless token is set. */
exports.supabaseClient = (0, supabase_js_1.createClient)(supabaseUrl || "", anonKey || "", {
    auth: { persistSession: false }
});
/**
 * Returns a Supabase client that acts as the given user (RLS applies).
 * Use for any authenticated user/hotel operation; do not use supabaseAdmin for those.
 */
function createSupabaseClientForUser(accessToken) {
    return (0, supabase_js_1.createClient)(supabaseUrl || "", anonKey || "", {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
}
