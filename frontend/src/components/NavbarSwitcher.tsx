"use client";

import { usePathname } from "next/navigation";
import { AdminNavbar } from "@/components/AdminNavbar";
import { AppNavbar } from "@/components/AppNavbar";

export function NavbarSwitcher() {
    const pathname = usePathname();

    if (pathname?.startsWith("/admin")) {
        return <AdminNavbar />;
    }

    return <AppNavbar />;
}
