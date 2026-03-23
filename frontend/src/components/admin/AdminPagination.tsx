"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminPaginationProps = {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    singularLabel?: string;
    pluralLabel?: string;
};

export function AdminPagination({
    page,
    pageSize,
    total,
    onPageChange,
    singularLabel = "item",
    pluralLabel
}: AdminPaginationProps) {
    const plural = pluralLabel ?? `${singularLabel}s`;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(safePage * pageSize, total);

    const windowSize = 5;
    let start = Math.max(1, safePage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

    return (
        <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                    {from} to {to}
                </span>{" "}
                of {total} {total === 1 ? singularLabel : plural}
            </p>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    aria-label="Previous page"
                    disabled={safePage <= 1}
                    onClick={() => onPageChange(safePage - 1)}
                    className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    )}
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                {pages.map((p) => (
                    <button
                        key={p}
                        type="button"
                        onClick={() => onPageChange(p)}
                        className={cn(
                            "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium transition",
                            p === safePage
                                ? "bg-primary text-primary-foreground"
                                : "border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        {p}
                    </button>
                ))}
                <button
                    type="button"
                    aria-label="Next page"
                    disabled={safePage >= totalPages}
                    onClick={() => onPageChange(safePage + 1)}
                    className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    )}
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
