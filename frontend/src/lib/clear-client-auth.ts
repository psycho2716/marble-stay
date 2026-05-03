import { syncMarbleRoleCookie } from "@/lib/marble-role-cookie";

/** Clears Marble Stay auth in localStorage and the role cookie used by middleware. */
export function clearClientAuth(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("supabase_access_token");
    window.localStorage.removeItem("user_role");
    window.localStorage.removeItem("user_email");
    syncMarbleRoleCookie(null);
}
