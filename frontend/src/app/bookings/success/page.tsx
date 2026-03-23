"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function BookingSuccessPage() {
    const searchParams = useSearchParams();
    const bookingId = searchParams.get("bookingId");

    return (
        <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
            <div className="rounded-full bg-emerald-100 p-4 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-16 w-16 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Booking confirmed
            </h1>
            <p className="mt-2 text-muted-foreground">
                Your reservation has been submitted successfully. The hotel will confirm your
                booking shortly.
            </p>
            {bookingId && (
                <p className="mt-1 text-xs text-muted-foreground">Reference: {bookingId}</p>
            )}
            <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link
                    href="/bookings"
                    className={buttonVariants({ variant: "default", size: "default" })}
                >
                    View my bookings
                </Link>
                <Link
                    href="/hotels"
                    className={buttonVariants({ variant: "outline", size: "default" })}
                >
                    Browse more rooms
                </Link>
            </div>
        </div>
    );
}
