import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export function HotelListCardSkeleton() {
    return (
        <div className="overflow-hidden rounded border border-border bg-card">
            <div className="flex flex-col md:flex-row md:items-stretch">
                <Skeleton className="h-44 w-full shrink-0 md:h-auto md:w-[320px] md:rounded-none" />
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-6">
                    <div className="min-w-0">
                        <div className="flex items-start justify-between gap-4">
                            <Skeleton className="h-5 w-40 md:h-6 md:w-48" />
                            <Skeleton className="h-4 w-8 shrink-0" />
                        </div>
                        <Skeleton className="mt-1 h-4 max-w-sm" />
                        <Separator className="my-2 h-px w-full bg-border" />
                        <div className="mt-1.5 space-y-1.5">
                            <Skeleton className="h-4 w-full max-w-full" />
                            <Skeleton className="h-4 w-[85%] max-w-md" />
                        </div>
                    </div>
                    <div className="flex items-end justify-between gap-6">
                        <div className="shrink-0 space-y-1">
                            <Skeleton className="h-8 w-20" />
                            <Skeleton className="h-3 w-14" />
                        </div>
                        <Skeleton className="h-10 w-28 rounded-md" />
                    </div>
                </div>
            </div>
        </div>
    );
}
