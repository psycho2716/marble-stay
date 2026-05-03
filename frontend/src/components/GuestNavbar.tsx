"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clearClientAuth } from "@/lib/clear-client-auth";

const guestLinks = [
  { href: "/bookings", label: "My Bookings" },
  { href: "/profile", label: "Profile" },
] as const;

export function GuestNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleLogout() {
    if (typeof window === "undefined") return;
    clearClientAuth();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-slate-900"
        >
          Marble <span className="text-primary-600">Stay</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <Link
            href="/"
            className={`rounded-lg px-3 py-2 font-medium transition sm:px-4 ${
              pathname === "/"
                ? "bg-primary-50 text-primary-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Home
          </Link>
          {guestLinks.map(({ href, label }) => {
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
                className={`rounded-lg px-3 py-2 font-medium transition sm:px-4 ${
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
            className="ml-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:ml-4 sm:px-4"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
