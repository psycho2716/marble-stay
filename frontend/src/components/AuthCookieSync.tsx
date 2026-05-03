"use client";

import { useEffect } from "react";
import { syncMarbleRoleCookie } from "@/lib/marble-role-cookie";

/**
 * Keeps the marble_role cookie aligned with localStorage so middleware can block cross-role navigation.
 */
export function AuthCookieSync() {
    useEffect(() => {
        const token = window.localStorage.getItem("token");
        const r = window.localStorage.getItem("user_role");
        if (!token) {
            syncMarbleRoleCookie(null);
            return;
        }
        if (r === "guest" || r === "hotel" || r === "admin") {
            syncMarbleRoleCookie(r);
        }
    }, []);

    return null;
}
