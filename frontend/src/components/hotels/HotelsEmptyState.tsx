import Link from "next/link";
import { SearchX } from "lucide-react";

type HotelsEmptyStateProps = {
  hasActiveFilters: boolean;
};

export function HotelsEmptyState({ hasActiveFilters }: HotelsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">
        {hasActiveFilters ? "No hotels match your filters" : "No verified hotels yet"}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {hasActiveFilters
          ? "Try clearing some filters or broadening your search to see more results."
          : "Verified hotels will appear here once they’re available. Check back later."}
      </p>
      {hasActiveFilters && (
        <Link
          href="/hotels"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Clear all filters
        </Link>
      )}
    </div>
  );
}
