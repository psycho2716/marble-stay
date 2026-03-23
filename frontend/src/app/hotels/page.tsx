import { HotelsEmptyState } from "@/components/hotels/HotelsEmptyState";
import { HotelListCard } from "@/components/hotels/HotelListCard";
import { HotelsPagination } from "@/components/hotels/HotelsPagination";
import { HotelsSidebar } from "@/components/hotels/HotelsSidebar";

type Hotel = {
    id: string;
    name: string;
    address: string | null;
    description?: string | null;
    verification_status: string;
    images?: string[] | null;
    profile_image?: string | null;
    profile_image_url?: string | null;
    average_rating?: number | null;
    review_count?: number;
    min_price?: string | null;
    currency?: string | null;
};

type HotelsResponse = {
    hotels: Hotel[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

async function fetchHotels(params?: {
    minPrice?: string;
    maxPrice?: string;
    rating?: string;
    amenities?: string;
    location?: string;
    page?: string;
}): Promise<HotelsResponse> {
    const qs = new URLSearchParams();
    if (params?.minPrice) qs.set("minPrice", params.minPrice);
    if (params?.maxPrice) qs.set("maxPrice", params.maxPrice);
    if (params?.rating) qs.set("rating", params.rating);
    if (params?.amenities) qs.set("amenities", params.amenities);
    if (params?.location) qs.set("location", params.location);
    if (params?.page) qs.set("page", params.page);
    const url = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/hotels${
        qs.toString() ? `?${qs.toString()}` : ""
    }`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return { hotels: [], total: 0, page: 1, limit: 8, totalPages: 1 };
    return res.json();
}

type HotelFilters = {
    price: { min: number | null; max: number | null };
    amenities: string[];
};

async function fetchHotelFilters(): Promise<HotelFilters> {
    const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/hotels/filters`,
        { next: { revalidate: 60 } }
    );
    if (!res.ok) return { price: { min: null, max: null }, amenities: [] };
    return res.json();
}

function parseNumberLike(v: string | null | undefined): number | null {
    if (!v) return null;
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
}

export default async function HotelsPage({
    searchParams
}: {
    searchParams?: {
        minPrice?: string;
        maxPrice?: string;
        rating?: string;
        amenities?: string;
        location?: string;
        page?: string;
    };
}) {
    const data = await fetchHotels(searchParams);
    const filters = await fetchHotelFilters();
    const { hotels, total, page, limit, totalPages } = data;

    const location = (searchParams?.location ?? "").trim();
    const heading = location ? `Hotels in ${location}` : "All Available Hotels";

    const hasActiveFilters =
        Boolean(searchParams?.minPrice) ||
        Boolean(searchParams?.maxPrice) ||
        Boolean(searchParams?.rating) ||
        Boolean(searchParams?.amenities) ||
        Boolean(searchParams?.location);

    return (
        <div className="min-h-[calc(100vh-3.5rem)] bg-background">
            <div className="mx-auto max-w-6xl px-4 py-8">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{heading}</h1>
                    <p className="mt-1 text-muted-foreground">
                        Showing the best-rated stays for your upcoming trip.
                    </p>
                </header>

                <div className="flex flex-col gap-8 lg:flex-row">
                    <HotelsSidebar searchParams={searchParams} amenityOptions={filters.amenities} />
                    <div className="min-w-0 flex-1 space-y-6">
                        {hotels.length === 0 ? (
                            <HotelsEmptyState hasActiveFilters={hasActiveFilters} />
                        ) : (
                            <>
                                <ul className="space-y-6">
                                    {hotels.map((hotel) => (
                                        <li key={hotel.id}>
                                            <HotelListCard
                                                id={hotel.id}
                                                name={hotel.name}
                                                address={hotel.address}
                                                imageUrl={
                                                    hotel.profile_image_url ??
                                                    (typeof hotel.profile_image === "string" &&
                                                    /^https?:\/\//i.test(hotel.profile_image)
                                                        ? hotel.profile_image
                                                        : null) ??
                                                    (Array.isArray(hotel.images) && hotel.images[0]
                                                        ? hotel.images[0]
                                                        : null)
                                                }
                                                rating={hotel.average_rating}
                                                reviewCount={hotel.review_count ?? 0}
                                                description={hotel.description ?? null}
                                                pricePerNight={hotel.min_price}
                                                currency={hotel.currency ?? "PHP"}
                                            />
                                        </li>
                                    ))}
                                </ul>
                                <HotelsPagination
                                    total={total}
                                    page={page}
                                    limit={limit}
                                    totalPages={totalPages}
                                    searchParams={{
                                        minPrice: searchParams?.minPrice,
                                        maxPrice: searchParams?.maxPrice,
                                        rating: searchParams?.rating,
                                        amenities: searchParams?.amenities,
                                        location: searchParams?.location
                                    }}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
