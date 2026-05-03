import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { MARBLE_ROLE_COOKIE_NAME } from "@/lib/marble-role-constants";

type MarbleRole = "guest" | "hotel" | "admin";

function cookieRole(request: NextRequest): MarbleRole | null {
    const v = request.cookies.get(MARBLE_ROLE_COOKIE_NAME)?.value;
    if (v === "guest" || v === "hotel" || v === "admin") return v;
    return null;
}

function isGuestOnlyPath(pathname: string): boolean {
    if (
        pathname.startsWith("/bookings") ||
        pathname.startsWith("/onboarding") ||
        pathname.startsWith("/recommendations") ||
        pathname.startsWith("/payment") ||
        pathname === "/profile" ||
        pathname.startsWith("/profile/")
    ) {
        return true;
    }
    return /^\/rooms\/[^/]+\/book(\/.*)?$/.test(pathname);
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const role = cookieRole(request);

    if (pathname.startsWith("/hotel")) {
        if (role === "guest" || role === "admin") {
            const url = request.nextUrl.clone();
            url.pathname = role === "admin" ? "/admin/verification" : "/";
            return NextResponse.redirect(url);
        }
    }

    if (pathname.startsWith("/admin")) {
        if (role === "guest" || role === "hotel") {
            const url = request.nextUrl.clone();
            url.pathname = role === "hotel" ? "/hotel/dashboard" : "/";
            return NextResponse.redirect(url);
        }
    }

    if (isGuestOnlyPath(pathname) && (role === "hotel" || role === "admin")) {
        const url = request.nextUrl.clone();
        url.pathname = role === "admin" ? "/admin/verification" : "/hotel/dashboard";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/hotel/:path*",
        "/admin/:path*",
        "/bookings",
        "/bookings/:path*",
        "/onboarding",
        "/onboarding/:path*",
        "/recommendations",
        "/recommendations/:path*",
        "/payment",
        "/payment/:path*",
        "/profile",
        "/profile/:path*",
        "/rooms/:roomId/book",
        "/rooms/:roomId/book/:path*"
    ]
};
