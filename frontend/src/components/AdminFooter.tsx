"use client";

import Link from "next/link";
import { MarbleStayLogo } from "@/components/MarbleStayLogo";

const LINKS = [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/support", label: "Help Center" }
] as const;

export function AdminFooter() {
    const year = new Date().getFullYear();

    return (
        <footer className="mt-auto border-t border-border bg-card">
            <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
                <MarbleStayLogo href="/admin/verification" role="admin" className="shrink-0" />
                <nav
                    className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-muted-foreground"
                    aria-label="Footer"
                >
                    {LINKS.map(({ href, label }) => (
                        <Link key={href} href={href} className="transition-colors hover:text-foreground">
                            {label}
                        </Link>
                    ))}
                </nav>
                <p className="text-sm text-muted-foreground sm:text-right">
                    © {year} Marble Stay Inc. All rights reserved.
                </p>
            </div>
        </footer>
    );
}
