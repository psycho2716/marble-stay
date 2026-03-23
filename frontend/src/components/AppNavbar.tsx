"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { MarbleStayLogo } from "@/components/MarbleStayLogo";
import userPlaceholder from "@/public/images/user.png";
import { MARBLESTAY_NAV_AVATAR_REFRESH } from "@/lib/navEvents";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "@/components/NotificationBell";

export type NavbarRole = "public" | "guest" | "hotel";

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

const PUBLIC_LINKS = [
    { href: "/", label: "Home" },
    { href: "/login", label: "Login" }
] as const;

const GUEST_LINKS = [
    { href: "/", label: "Home" },
    { href: "/recommendations", label: "For you" },
    { href: "/bookings", label: "My Bookings" }
] as const;

const HOTEL_LINKS = [
    { href: "/hotel/dashboard", label: "Dashboard" },
    { href: "/hotel/rooms", label: "Rooms" },
    { href: "/hotel/bookings", label: "Bookings" }
] as const;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getNavAuthHeaders(): HeadersInit {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
    const supabaseToken =
        typeof window !== "undefined" ? window.localStorage.getItem("supabase_access_token") : null;
    return {
        Authorization: `Bearer ${token ?? ""}`,
        ...(supabaseToken ? { "x-supabase-access-token": supabaseToken } : {})
    };
}

/** Profile menu avatar: uploaded image or placeholder. */
function NavbarUserAvatar({ imageUrl }: { imageUrl: string | null }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => {
        setBroken(false);
    }, [imageUrl]);

    if (imageUrl && !broken) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- remote Supabase / signed URLs
            <img
                src={imageUrl}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 object-cover"
                onError={() => setBroken(true)}
            />
        );
    }
    return (
        <Image
            src={userPlaceholder}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 object-cover"
        />
    );
}

function NavLink({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
    return (
        <Link
            href={href}
            className={`border-b-2 px-1 py-4 text-sm font-medium transition ${
                isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
            {label}
        </Link>
    );
}

export function AppNavbar() {
    const pathname = usePathname();
    const router = useRouter();
    const [role, setRole] = useState<NavbarRole | "loading">("loading");
    const [email, setEmail] = useState<string | null>(null);
    const [navbarAvatarUrl, setNavbarAvatarUrl] = useState<string | null>(null);

    const refreshNavbarAvatar = useCallback(async () => {
        const token =
            typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
        if (!token) {
            setNavbarAvatarUrl(null);
            return;
        }
        try {
            const meRes = await fetch(`${API_BASE}/api/auth/me`, { headers: getNavAuthHeaders() });
            if (!meRes.ok) {
                setNavbarAvatarUrl(null);
                return;
            }
            const me = (await meRes.json()) as {
                role?: string;
                avatar_url?: string | null;
            };
            if (me.role === "guest") {
                setNavbarAvatarUrl(
                    typeof me.avatar_url === "string" && me.avatar_url.trim() ? me.avatar_url : null
                );
                return;
            }
            if (me.role === "hotel") {
                const hRes = await fetch(`${API_BASE}/api/me/hotel`, {
                    headers: getNavAuthHeaders()
                });
                if (!hRes.ok) {
                    setNavbarAvatarUrl(null);
                    return;
                }
                const h = (await hRes.json()) as { profile_image_url?: string | null };
                setNavbarAvatarUrl(
                    typeof h.profile_image_url === "string" && h.profile_image_url.trim()
                        ? h.profile_image_url
                        : null
                );
                return;
            }
            setNavbarAvatarUrl(null);
        } catch {
            setNavbarAvatarUrl(null);
        }
    }, []);

    useEffect(() => {
        const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
        const supabaseAccessToken =
            typeof window !== "undefined"
                ? window.localStorage.getItem("supabase_access_token")
                : null;
        const userRole =
            typeof window !== "undefined" ? window.localStorage.getItem("user_role") : null;
        const storedEmail =
            typeof window !== "undefined" ? window.localStorage.getItem("user_email") : null;

        setEmail(storedEmail ?? tryDecodeJwtEmail(token) ?? tryDecodeJwtEmail(supabaseAccessToken));

        if (pathname?.startsWith("/admin")) {
            setRole("public");
            return;
        }
        if (!token) {
            setRole("public");
            return;
        }
        // Only show hotel navbar when on /hotel/* and the user is actually a hotel (role from login).
        if (pathname?.startsWith("/hotel") && userRole === "hotel") {
            setRole("hotel");
            return;
        }
        setRole("guest");
    }, [pathname]);

    useEffect(() => {
        if (role === "loading" || role === "public") {
            setNavbarAvatarUrl(null);
            return;
        }
        void refreshNavbarAvatar();
    }, [role, pathname, refreshNavbarAvatar]);

    useEffect(() => {
        const onRefresh = () => {
            void refreshNavbarAvatar();
        };
        window.addEventListener(MARBLESTAY_NAV_AVATAR_REFRESH, onRefresh);
        return () => window.removeEventListener(MARBLESTAY_NAV_AVATAR_REFRESH, onRefresh);
    }, [refreshNavbarAvatar]);

    function handleLogout() {
        if (typeof window === "undefined") return;
        const wasHotel = role === "hotel";
        window.localStorage.removeItem("token");
        window.localStorage.removeItem("supabase_access_token");
        window.localStorage.removeItem("user_role");
        window.localStorage.removeItem("user_email");
        setNavbarAvatarUrl(null);
        setEmail(null);
        setRole("public");
        router.push(wasHotel ? "/login" : "/");
        router.refresh();
    }

    const profileHref = role === "hotel" ? "/hotel/profile" : "/profile";
    const emailText = email ?? "";

    if (role === "loading") {
        return (
            <header className="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur-sm">
                <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
                    <div className="flex flex-1 items-center">
                        <MarbleStayLogo href="/" />
                    </div>
                    <nav className="flex items-center gap-8">
                        <span className="h-3 w-28 rounded bg-muted" />
                    </nav>
                    <div className="flex flex-1 justify-end">
                        <span className="h-9 w-20 rounded-full bg-muted" />
                    </div>
                </div>
            </header>
        );
    }

    if (role === "hotel") {
        return (
            <header className="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur-sm">
                <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
                    <div className="flex flex-1 items-center">
                        <MarbleStayLogo href="/" role={role} />
                    </div>

                    <div className="flex items-center gap-4">
                        <nav className="flex items-center gap-8">
                            {HOTEL_LINKS.map(({ href, label }) => (
                                <NavLink
                                    key={href}
                                    href={href}
                                    label={label}
                                    isActive={pathname === href || pathname?.startsWith(href)}
                                />
                            ))}
                        </nav>

                        <div className="w-[1px] h-7 bg-border" />

                        <div className="flex flex-1 items-center justify-end gap-2">
                            <NotificationBell role="hotel" />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
                                    >
                                        <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                                            <NavbarUserAvatar imageUrl={navbarAvatarUrl} />
                                        </span>
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-60">
                                    <DropdownMenuLabel className="px-3 py-2">
                                        <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground">
                                            SIGNED IN AS
                                        </span>
                                        <span className="mt-1 block truncate text-sm font-semibold text-foreground">
                                            {emailText}
                                        </span>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild className="px-3 py-2">
                                        <Link href={profileHref}>
                                            <User className="h-4 w-4" />
                                            Profile
                                        </Link>
                                    </DropdownMenuItem>
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
                </div>
            </header>
        );
    }

    if (role === "guest") {
        return (
            <header className="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur-sm">
                <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
                    <div className="flex flex-1 items-center">
                        <MarbleStayLogo href="/" role={role} />
                    </div>

                    <div className="flex items-center gap-4">
                        <nav className="flex items-center gap-8">
                            {GUEST_LINKS.map(({ href, label }) => (
                                <NavLink
                                    key={href}
                                    href={href}
                                    label={label}
                                    isActive={pathname === href}
                                />
                            ))}
                        </nav>

                        <div className="w-[1px] h-7 bg-border" />

                        <div className="flex flex-1 items-center justify-end gap-2">
                            <NotificationBell role="guest" />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
                                    >
                                        <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                                            <NavbarUserAvatar imageUrl={navbarAvatarUrl} />
                                        </span>
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-60">
                                    <DropdownMenuLabel className="px-3 py-2">
                                        <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground">
                                            SIGNED IN AS
                                        </span>
                                        <span className="mt-1 block truncate text-sm font-semibold text-foreground">
                                            {emailText}
                                        </span>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild className="px-3 py-2">
                                        <Link href={profileHref}>
                                            <User className="h-4 w-4" />
                                            Profile
                                        </Link>
                                    </DropdownMenuItem>
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
                </div>
            </header>
        );
    }

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur-sm">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                <div className="flex flex-1 items-center">
                    <MarbleStayLogo href="/" role={role} />
                </div>
                <div className="flex items-center gap-4">
                    <nav className="flex items-center gap-6">
                        {PUBLIC_LINKS.map(({ href, label }) => (
                            <NavLink
                                key={href}
                                href={href}
                                label={label}
                                isActive={pathname === href}
                            />
                        ))}
                    </nav>
                    <div className="flex flex-1 justify-end">
                        <Link
                            href="/signup"
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                        >
                            Sign up
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}
