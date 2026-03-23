"use client";

import Link from "next/link";
import { MarbleStayLogo } from "@/components/MarbleStayLogo";

const FOOTER_LINKS = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/support", label: "Support" },
    { href: "/contact", label: "Contact" }
] as const;

export function SiteFooter() {
    const year = new Date().getFullYear();

    return (
        <footer className="h-52 flex flex-col items-center justify-between border-t border-border bg-card py-4">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-10 px-4 py-6 sm:flex-row">
                <MarbleStayLogo href="/" className="shrink-0" />
                <nav
                    className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-muted-foreground"
                    aria-label="Footer"
                >
                    {FOOTER_LINKS.map(({ href, label }) => (
                        <Link
                            key={href}
                            href={href}
                            className="hover:text-foreground transition-colors"
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
            </div>
            <p className="shrink-0 text-sm text-muted-foreground">
                © {year} Marble Stay. All rights reserved.
            </p>
        </footer>
    );
}
