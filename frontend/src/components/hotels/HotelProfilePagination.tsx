import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type HotelProfilePaginationProps = {
    hotelId: string;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

function buildQuery(pageNum: number): string {
    if (pageNum <= 1) return "";
    return `?page=${pageNum}`;
}

export function HotelProfilePagination({
    hotelId,
    total,
    page,
    limit,
    totalPages
}: HotelProfilePaginationProps) {
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = total === 0 ? 0 : Math.min(page * limit, total);

    return (
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
            <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                    {start}–{end}
                </span>{" "}
                of <span className="font-medium text-foreground">{total}</span> rooms
            </p>
            <nav className="flex items-center gap-1.5" aria-label="Pagination">
                <Link
                    href={`/hotels/${hotelId}${buildQuery(page - 1)}`}
                    className={`inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition ${
                        page <= 1
                            ? "pointer-events-none border-border bg-muted text-muted-foreground"
                            : "bg-card text-foreground hover:bg-muted"
                    }`}
                    aria-disabled={page <= 1}
                >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                </Link>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Link
                        key={p}
                        href={`/hotels/${hotelId}${buildQuery(p)}`}
                        className={`min-w-[2.25rem] rounded-lg border px-3 py-2 text-center text-sm font-medium transition ${
                            p === page
                                ? "border-foreground bg-foreground text-background"
                                : "border-border bg-card text-foreground hover:bg-muted"
                        }`}
                        aria-current={p === page ? "page" : undefined}
                    >
                        {p}
                    </Link>
                ))}
                <Link
                    href={`/hotels/${hotelId}${buildQuery(page + 1)}`}
                    className={`inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition ${
                        page >= totalPages
                            ? "pointer-events-none border-border bg-muted text-muted-foreground"
                            : "bg-card text-foreground hover:bg-muted"
                    }`}
                    aria-disabled={page >= totalPages}
                >
                    Next
                    <ChevronRight className="h-4 w-4" />
                </Link>
            </nav>
        </div>
    );
}
