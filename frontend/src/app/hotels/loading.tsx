import { HotelListCardSkeleton } from "@/components/hotels/HotelListCardSkeleton";
import { HotelsSidebar } from "@/components/hotels/HotelsSidebar";

export default function HotelsLoading() {
    return (
        <div className="min-h-[calc(100vh-3.5rem)] bg-background">
            <div className="mx-auto max-w-6xl px-4 py-8">
                <header className="mb-8">
                    <div className="h-9 w-64 animate-pulse rounded bg-muted" />
                    <div className="mt-2 h-5 w-96 animate-pulse rounded bg-muted" />
                </header>
                <div className="flex flex-col gap-8 lg:flex-row">
                    <HotelsSidebar searchParams={{ rating: "4" }} amenityOptions={[]} />
                    <div className="min-w-0 flex-1 space-y-6">
                        {[1, 2, 3].map((i) => (
                            <HotelListCardSkeleton key={i} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
