"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { MarbleStayLogo } from "@/components/MarbleStayLogo";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
    { href: "/admin/verification", label: "Verification" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/hotels", label: "Hotels" }
] as const;

function tryDecodeJwtEmail(token: string | null): string | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
        const payloadBase64Url = parts[1];
        const payloadBase64 = payloadBase64Url.replace(/-/g, "+").replace(/_/g, "/");
        const pad = payloadBase64.length % 4;
        const padded = pad ? payloadBase64 + "=".repeat(4 - pad) : payloadBase64;
        const json = atob(padded);
        const payload = JSON.parse(json) as { email?: unknown };
        return typeof payload.email === "string" ? payload.email : null;
    } catch {
        return null;
    }
}

export function AdminNavbar() {
    const pathname = usePathname();
    const router = useRouter();
    const [email, setEmail] = useState<string | null>(null);

    useEffect(() => {
        const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
        const stored =
            typeof window !== "undefined" ? window.localStorage.getItem("user_email") : null;
        setEmail(stored ?? tryDecodeJwtEmail(token));
    }, [pathname]);

    function handleLogout() {
        if (typeof window === "undefined") return;
        window.localStorage.removeItem("token");
        window.localStorage.removeItem("supabase_access_token");
        window.localStorage.removeItem("user_role");
        window.localStorage.removeItem("user_email");
        router.push("/login");
        router.refresh();
    }

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
            <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
                <div className="flex min-w-0 flex-1 items-center">
                    <MarbleStayLogo href="/admin/verification" role="admin" />
                </div>

                <nav className="hidden items-center gap-1 md:flex" aria-label="Admin">
                    {ADMIN_LINKS.map(({ href, label }) => {
                        const isActive = pathname === href || pathname?.startsWith(`${href}/`);
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={cn(
                                    "relative px-4 py-4 text-sm font-medium transition-colors",
                                    isActive
                                        ? "text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {label}
                                {isActive && (
                                    <span
                                        className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-primary"
                                        aria-hidden
                                    />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="flex flex-1 justify-end">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
                                aria-label="Account menu"
                            >
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                                    <User className="h-4 w-4" />
                                </span>
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuLabel className="px-3 py-2">
                                <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Signed in as
                                </span>
                                <span className="mt-1 block truncate text-sm font-semibold text-foreground">
                                    {email ?? "Admin"}
                                </span>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="px-3 py-2 text-destructive focus:text-destructive"
                                onSelect={(e) => {
                                    e.preventDefault();
                                    handleLogout();
                                }}
                            >
                                <LogOut className="h-4 w-4" />
                                Logout
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <nav
                className="flex border-t border-border px-4 md:hidden"
                aria-label="Admin mobile"
            >
                {ADMIN_LINKS.map(({ href, label }) => {
                    const isActive = pathname === href || pathname?.startsWith(`${href}/`);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex-1 border-b-2 py-3 text-center text-xs font-medium transition-colors",
                                isActive
                                    ? "border-primary text-foreground"
                                    : "border-transparent text-muted-foreground"
                            )}
                        >
                            {label}
                        </Link>
                    );
                })}
            </nav>
        </header>
    );
}
