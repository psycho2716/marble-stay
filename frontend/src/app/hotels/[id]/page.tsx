import Link from "next/link";
import Image from "next/image";
import { MapPin, Star, Settings2 } from "lucide-react";
import type { OpeningHoursRecord } from "@/lib/openingHoursDisplay";
import { HotelProfileSidebar } from "@/components/hotels/HotelProfileSidebar";
import { HotelProfileRoomCard } from "@/components/hotels/HotelProfileRoomCard";
import { HotelProfilePagination } from "@/components/hotels/HotelProfilePagination";

type Room = {
    id: string;
    name: string;
    room_type: string;
    base_price_night: string;
    capacity: number;
    description?: string | null;
    media?: { type: string; path: string }[];
    main_image_url?: string | null;
};

type HotelDetailResponse = {
    hotel: {
        id: string;
        name: string;
        address: string;
        description: string | null;
        bio?: string | null;
        contact_email?: string | null;
        contact_phone?: string | null;
        check_in_time?: string | null;
        check_out_time?: string | null;
        opening_hours?: OpeningHoursRecord | null;
        latitude?: number | null;
        longitude?: number | null;
        profile_image_url?: string;
        cover_image_url?: string;
        currency?: string | null;
        average_rating?: number | null;
        review_count?: number;
        amenities?: string[];
    };
    rooms: Room[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

async function fetchHotel(id: string, page = 1): Promise<HotelDetailResponse | null> {
    const url = new URL(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/hotels/${id}`
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "6");
    const res = await fetch(url.toString(), { next: { revalidate: 60 } });

    if (!res.ok) {
        return null;
    }

    return res.json();
}

export default async function HotelDetailPage({
    params,
    searchParams
}: {
    params: { id: string };
    searchParams: { page?: string };
}) {
    const page = Math.max(1, parseInt(searchParams?.page ?? "1", 10) || 1);
    const data = await fetchHotel(params.id, page);

    if (!data) {
        return (
            <main className="min-h-screen bg-background">
                <div className="mx-auto max-w-6xl px-4 py-10">
                    <p className="text-sm text-muted-foreground">Hotel not found.</p>
                    <Link
                        href="/hotels"
                        className="mt-4 inline-block text-sm font-medium text-foreground hover:underline"
                    >
                        ← Back to hotels list
                    </Link>
                </div>
            </main>
        );
    }

    const { hotel, rooms, total, totalPages, limit } = data;
    const rating = hotel.average_rating != null ? Number(hotel.average_rating).toFixed(1) : "0";
    const reviewCount = hotel.review_count ?? 0;
    const reviewLabel = reviewCount === 1 ? "1 review" : `${reviewCount.toLocaleString()} reviews`;

    return (
        <main className="min-h-screen bg-background">
            {/* Hero: full-width cover with gradient overlay, name + location + rating bottom-left */}
            <div className="relative h-64 w-full bg-muted sm:h-80 md:h-96">
                {hotel.cover_image_url ? (
                    <Image
                        src={hotel.cover_image_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="100vw"
                        priority
                        unoptimized
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/80 text-muted-foreground">
                        <span className="text-sm font-medium">No cover image</span>
                    </div>
                )}
                <div
                    className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"
                    aria-hidden
                />
                <div className="absolute bottom-0 left-52 right-52 p-6 text-white md:p-8">
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{hotel.name}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-white/90">
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="h-4 w-4 shrink-0" />
                            {hotel.address}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            {rating} ({reviewLabel})
                        </span>
                    </div>
                </div>
            </div>

            {/* Two-column: sidebar + main */}
            <div className="mx-auto max-w-[85%] px-4 py-8">
                <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
                    {/* Left sidebar ~30% */}
                    <div className="w-full shrink-0 lg:w-[30%] lg:max-w-sm">
                        <HotelProfileSidebar
                            description={hotel.description ?? null}
                            bio={hotel.bio ?? null}
                            amenities={hotel.amenities ?? []}
                            check_in_time={hotel.check_in_time}
                            check_out_time={hotel.check_out_time}
                            opening_hours={hotel.opening_hours}
                            address={hotel.address}
                            latitude={hotel.latitude}
                            longitude={hotel.longitude}
                        />
                    </div>

                    {/* Right main: Available Rooms + grid + pagination */}
                    <div className="min-w-0 flex-1">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <h2 className="text-xl font-bold text-foreground md:text-2xl">
                                Available Rooms
                            </h2>
                            <button
                                type="button"
                                className="rounded-lg border border-border bg-card p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                aria-label="Filter or sort rooms"
                            >
                                <Settings2 className="h-5 w-5" />
                            </button>
                        </div>

                        {rooms.length === 0 ? (
                            <p className="rounded border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                                No rooms listed yet.
                            </p>
                        ) : (
                            <>
                                <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                    {rooms.map((room) => (
                                        <li key={room.id}>
                                            <HotelProfileRoomCard
                                                id={room.id}
                                                name={room.name}
                                                description={room.description}
                                                base_price_night={room.base_price_night}
                                                main_image_url={room.main_image_url}
                                                currency={hotel.currency}
                                            />
                                        </li>
                                    ))}
                                </ul>
                                {totalPages > 1 && (
                                    <HotelProfilePagination
                                        hotelId={hotel.id}
                                        total={total}
                                        page={page}
                                        limit={limit}
                                        totalPages={totalPages}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
