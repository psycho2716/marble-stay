"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const guestNavLinks = [
  { href: "/profile", label: "Profile" },
  { href: "/bookings", label: "My bookings" },
  { href: "/recommendations", label: "Recommended stays" },
  { href: "/profile?tab=settings", label: "Settings" },
  { href: "/payment", label: "Payment" },
] as const;

export function PublicNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
    setIsLoggedIn(!!token);
  }, [pathname]);

  function handleLogout() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("supabase_access_token");
    setIsLoggedIn(false);
    router.push("/");
    router.refresh();
  }

  if (!mounted) {
    return (
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-semibold tracking-tight text-slate-900">
            Marble <span className="text-primary-600">Stay</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm sm:gap-3">
            <Link
              href="/hotels"
              className="rounded-full border border-slate-200 px-3 py-2 text-slate-700 transition hover:bg-slate-50 sm:px-4"
            >
              Browse stays
            </Link>
            <span className="rounded-full px-3 py-2 text-slate-400 sm:px-4">Login</span>
            <span className="rounded-full bg-slate-200 px-3 py-2 sm:px-4">Sign up</span>
            <Link
              href="/signup?role=hotel"
              className="rounded-full border border-primary-200 px-3 py-2 text-primary-700 transition hover:bg-primary-50 sm:px-4"
            >
              List your hotel
            </Link>
          </nav>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight text-slate-900">
          Marble <span className="text-primary-600">Stay</span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1 text-sm sm:gap-2">
          <Link
            href="/hotels"
            className={`rounded-full border border-slate-200 px-3 py-2 transition hover:bg-slate-50 sm:px-4 ${
              pathname === "/hotels" ? "bg-primary-50 border-primary-200 text-primary-700" : "text-slate-700"
            }`}
          >
            Browse stays
          </Link>
          {isLoggedIn ? (
            <>
              {guestNavLinks.map(({ href, label }) => {
                const isSettings = href.startsWith("/profile?tab=settings");
                const isProfile = href === "/profile";
                const tab = searchParams.get("tab");
                const isActive = isSettings
                  ? pathname === "/profile" && tab === "settings"
                  : isProfile
                    ? pathname === "/profile" && tab !== "settings"
                    : pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`rounded-full px-3 py-2 font-medium transition sm:px-4 ${
                      isActive
                        ? "bg-primary-50 text-primary-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-200 px-3 py-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:px-4"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3 py-2 text-slate-600 transition hover:bg-slate-100 sm:px-4"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-primary-600 px-3 py-2 font-medium text-white transition hover:bg-primary-700 sm:px-4"
              >
                Sign up
              </Link>
              <Link
                href="/signup?role=hotel"
                className="rounded-full border border-primary-200 px-3 py-2 text-primary-700 transition hover:bg-primary-50 sm:px-4"
              >
                List your hotel
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
