"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Redirects new guests who have not finished preference onboarding to `/onboarding`.
 */
export function GuestOnboardingGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (!token) return;

        const p = pathname ?? "";
        if (
            p.startsWith("/login") ||
            p.startsWith("/signup") ||
            p.startsWith("/onboarding") ||
            p.startsWith("/admin") ||
            p.startsWith("/hotel")
        ) {
            return;
        }

        let cancelled = false;
        void (async () => {
            try {
                const supabaseToken = localStorage.getItem("supabase_access_token");
                const res = await fetch(`${API_BASE}/api/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
                    }
                });
                if (!res.ok || cancelled) return;
                const me = (await res.json()) as {
                    role?: string;
                    needs_onboarding?: boolean;
                };
                if (me.role === "guest" && me.needs_onboarding) {
                    router.replace("/onboarding");
                }
            } catch {
                /* ignore */
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [pathname, router]);

    return <>{children}</>;
}
