"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/public/images/logo.png";

/** Three vertical pill shapes + "Marble Stay" — matches UI design. */
export function MarbleStayLogo({
    href = "/",
    role = "",
    className = "",
    showText = true
}: {
    href?: string;
    /** When set, appends role suffix after the brand name (ignored for public / empty). */
    role?: "" | "public" | "guest" | "hotel" | "admin";
    className?: string;
    showText?: boolean;
}) {
    const content = (
        <>
            <Image src={logo} alt="Marble Stay Logo" width={32} height={32} />
            {showText && (
                <span className="ml-2 text-xl font-bold tracking-tight">
                    <span className="text-primary font-bold">Marble Stay</span>
                    <span className="capitalize font-medium">
                        {role === "hotel" ? (
                            <span className="text-primary font-bold"> · Hotel</span>
                        ) : role === "guest" ? (
                            <span className="text-primary font-bold"> · Guest</span>
                        ) : role === "admin" ? (
                            <span className="text-primary font-bold"> · Admin</span>
                        ) : (
                            ""
                        )}
                    </span>
                </span>
            )}
        </>
    );

    const sharedClass = `inline-flex items-center text-[var(--foreground)] ${className}`.trim();

    if (href) {
        return (
            <Link href={href} className={sharedClass}>
                {content}
            </Link>
        );
    }

    return <span className={sharedClass}>{content}</span>;
}
