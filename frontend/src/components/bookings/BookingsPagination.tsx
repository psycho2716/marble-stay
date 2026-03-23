"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type BookingsPaginationProps = {
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    disabled?: boolean;
    className?: string;
};

export function BookingsPagination({
    total,
    page,
    pageSize,
    onPageChange,
    disabled = false,
    className
}: BookingsPaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = total === 0 ? 0 : Math.min(page * pageSize, total);

    if (total === 0 || totalPages <= 1) return null;

    return (
        <div
            className={cn(
                "flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row",
                className
            )}
        >
            <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                    {start}–{end}
                </span>{" "}
                of <span className="font-medium text-foreground">{total}</span> bookings
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Bookings pagination">
                <button
                    type="button"
                    disabled={page <= 1 || disabled}
                    onClick={() => onPageChange(page - 1)}
                    className={cn(
                        "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition",
                        page <= 1 || disabled
                            ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                            : "bg-card text-foreground hover:bg-muted"
                    )}
                >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                        key={p}
                        type="button"
                        disabled={disabled}
                        onClick={() => onPageChange(p)}
                        className={cn(
                            "min-w-[2.25rem] rounded-lg border px-3 py-2 text-center text-sm font-medium transition",
                            p === page
                                ? "border-foreground bg-foreground text-background"
                                : "border-border bg-card text-foreground hover:bg-muted",
                            disabled && "cursor-not-allowed opacity-60"
                        )}
                        aria-current={p === page ? "page" : undefined}
                    >
                        {p}
                    </button>
                ))}
                <button
                    type="button"
                    disabled={page >= totalPages || disabled}
                    onClick={() => onPageChange(page + 1)}
                    className={cn(
                        "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition",
                        page >= totalPages || disabled
                            ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                            : "bg-card text-foreground hover:bg-muted"
                    )}
                >
                    Next
                    <ChevronRight className="h-4 w-4" />
                </button>
            </nav>
        </div>
    );
}
