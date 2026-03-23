"use client";

import { usePathname } from "next/navigation";
import { AdminFooter } from "@/components/AdminFooter";
import { SiteFooter } from "@/components/SiteFooter";

function shouldHideFooter(pathname: string | null): boolean {
    if (!pathname) return false;
    return (
        pathname === "/login" ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/onboarding")
    );
}

export function FooterSwitcher() {
    const pathname = usePathname();

    if (shouldHideFooter(pathname)) return null;
    if (pathname?.startsWith("/admin")) {
        return <AdminFooter />;
    }
    return <SiteFooter />;
}

