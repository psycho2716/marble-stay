import { MARBLE_ROLE_COOKIE_NAME, MARBLE_ROLE_MAX_AGE_SEC } from "@/lib/marble-role-constants";

export function syncMarbleRoleCookie(role: "guest" | "hotel" | "admin" | null): void {
    if (typeof document === "undefined") return;
    const base = `Path=/; SameSite=Lax`;
    if (role == null) {
        document.cookie = `${MARBLE_ROLE_COOKIE_NAME}=; ${base}; Max-Age=0`;
        return;
    }
    document.cookie = `${MARBLE_ROLE_COOKIE_NAME}=${role}; ${base}; Max-Age=${MARBLE_ROLE_MAX_AGE_SEC}`;
}
