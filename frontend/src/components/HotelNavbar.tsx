"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const hotelLinks = [
  { href: "/hotel/dashboard", label: "Dashboard" },
  { href: "/hotel/rooms", label: "Rooms" },
  { href: "/hotel/profile", label: "Profile" },
  { href: "/hotel/bookings", label: "Bookings" },
] as const;

export function HotelNavbar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("supabase_access_token");
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/hotel/dashboard"
          className="text-xl font-semibold tracking-tight text-slate-900"
        >
          Hotel <span className="text-primary-600">· Marble Stay</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          {hotelLinks.map(({ href, label }) => {
            const isActive = pathname === href;
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
          <Link
            href="/"
            className="rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:px-4"
          >
            Home
          </Link>
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
