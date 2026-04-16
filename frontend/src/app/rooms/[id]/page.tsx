import Link from "next/link";
import { Ruler, Users, BedDouble, Star, ArrowLeft } from "lucide-react";
import { RoomGallery } from "@/components/room/RoomGallery";
import { RoomPolicies } from "@/components/room/RoomPolicies";
import { RoomAmenities } from "@/components/room/RoomAmenities";
import { RoomBookingSidebar } from "@/components/room/RoomBookingSidebar";
import { buttonVariants } from "@/components/ui/button";

type MediaItem = { type: string; path: string; url: string };

type RoomDetailResponse = {
    room: {
        id: string;
        name: string;
        room_type: string;
        base_price_night: string;
        hourly_rate?: string | null;
        capacity: number;
        description?: string | null;
        bathroom_count?: number | null;
        offer_hourly?: boolean;
        amenities?: string[];
        media: MediaItem[];
        featured?: boolean;
        pets_policy?: string | null;
        smoking_policy?: string | null;
        cancellation_policy?: string | null;
        custom_policies?: Array<{
            iconKey?: string | null;
            icon_key?: string | null;
            icon?: string | null;
            label?: string | null;
            value?: string | null;
        }> | null;
    };
    hotel: {
        id: string;
        name: string;
        address: string;
        payment_qr_image_url?: string | null;
        payment_account_name?: string | null;
        payment_account_number?: string | null;
        payment_methods?: Array<{
            id: string;
            label: string;
            qr_image_url?: string;
            account_name: string | null;
            account_number: string | null;
        }>;
        currency?: string | null;
        check_in_time?: string | null;
        check_out_time?: string | null;
        pets_policy?: string | null;
        smoking_policy?: string | null;
        cancellation_policy?: string | null;
    };
    rating?: {
        average_rating: number | null;
        review_count: number;
    };
    reviews?: Array<{
        rating: number;
        comment: string;
        created_at: string;
    }>;
};

async function fetchRoom(id: string): Promise<RoomDetailResponse | null> {
    const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/rooms/${id}`,
        { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
}

export default async function RoomDetailPage({ params }: { params: { id: string } }) {
    const data = await fetchRoom(params.id);

    if (!data) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-10">
                <p className="text-sm text-muted-foreground">Room not found.</p>
                <Link
                    href="/hotels"
                    className="mt-4 inline-block font-medium text-primary hover:underline"
                >
                    ← Browse rooms
                </Link>
            </div>
        );
    }

    const { room, hotel, rating, reviews } = data;
    const media = room.media ?? [];
    const filledStars =
        rating && rating.review_count > 0 && rating.average_rating != null
            ? Math.round(rating.average_rating)
            : 0;
    const formattedRating =
        rating && rating.review_count > 0 && rating.average_rating != null
            ? rating.average_rating.toFixed(1)
            : null;

    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-7xl px-4 pb-12 pt-6">
                <nav className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Link
                        href={`/hotels/${hotel.id}`}
                        className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 hover:bg-muted"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Go Back
                    </Link>
                </nav>

                <div className="mt-6 grid gap-8 lg:grid-cols-3 lg:items-start lg:gap-10">
                    {/* Gallery spans full width at desktop so it doesn't squeeze the booking card */}
                    <div className="lg:col-span-3">
                        <RoomGallery media={media} />
                    </div>

                    {/* Room details (left) */}
                    <div className="min-w-0 lg:col-span-2">
                        {/* Header: FEATURED badge (only when room is featured) + stars + title */}
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            {room.featured && (
                                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
                                    Featured
                                </span>
                            )}
                            <span className="inline-flex items-center gap-0.5" aria-hidden>
                                {[1, 2, 3, 4, 5].map((i) => {
                                    const filled = i <= filledStars;
                                    return (
                                        <Star
                                            key={i}
                                            className={
                                                filled
                                                    ? "h-4 w-4 text-amber-500"
                                                    : "h-4 w-4 text-amber-400"
                                            }
                                            fill={filled ? "currentColor" : "none"}
                                        />
                                    );
                                })}
                            </span>
                            {formattedRating && (
                                <span className="text-sm font-medium text-muted-foreground">
                                    {formattedRating} ({rating?.review_count ?? 0} reviews)
                                </span>
                            )}
                        </div>

                        <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            {room.name}
                        </h1>

                        {/* Quick specs: sq ft / guests / bed */}
                        <div className="mt-4 flex flex-wrap gap-6 text-sm text-muted-foreground">
                            {room.bathroom_count != null && room.bathroom_count > 0 && (
                                <span className="flex items-center gap-2">
                                    <Ruler className="h-4 w-4 shrink-0" />
                                    {room.bathroom_count} bathroom
                                    {room.bathroom_count !== 1 ? "s" : ""}
                                </span>
                            )}
                            <span className="flex items-center gap-2">
                                <Users className="h-4 w-4 shrink-0" />
                                {room.capacity} guest{room.capacity !== 1 ? "s" : ""}
                            </span>
                            <span className="flex items-center gap-2">
                                <BedDouble className="h-4 w-4 shrink-0" />
                                {room.room_type}
                            </span>
                        </div>

                        {room.description && (
                            <section className="mt-6">
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                    {room.description}
                                </p>
                            </section>
                        )}

                        {room.amenities && room.amenities.length > 0 && (
                            <div className="mt-8">
                                <RoomAmenities amenities={room.amenities} />
                            </div>
                        )}

                        <div className="mt-8">
                            <RoomPolicies
                                checkIn={hotel.check_in_time}
                                checkOut={hotel.check_out_time}
                                pets={room.pets_policy ?? hotel.pets_policy}
                                smoking={room.smoking_policy ?? hotel.smoking_policy}
                                cancellation={room.cancellation_policy ?? hotel.cancellation_policy}
                                customPolicies={room.custom_policies ?? null}
                            />
                        </div>

                        <section className="mt-10">
                            <h2 className="text-lg font-semibold text-foreground">Guest Reviews</h2>
                            {!reviews || reviews.length === 0 ? (
                                <p className="mt-3 text-sm text-muted-foreground">
                                    No review comments submitted for this room yet.
                                </p>
                            ) : (
                                <ul className="mt-4 space-y-4">
                                    {reviews.map((review) => (
                                        <li
                                            key={`${review.created_at}-${review.comment}`}
                                            className="rounded-lg border border-border bg-card p-4"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-500">
                                                    <Star className="h-4 w-4 fill-current" />
                                                    {review.rating.toFixed(1)}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {new Intl.DateTimeFormat("en-PH", {
                                                        year: "numeric",
                                                        month: "short",
                                                        day: "numeric"
                                                    }).format(new Date(review.created_at))}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm leading-relaxed text-foreground">
                                                {review.comment}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>

                    {/* Booking widget (right) */}
                    <div className="lg:col-span-1">
                        <RoomBookingSidebar
                            roomId={room.id}
                            roomName={room.name}
                            basePriceNight={room.base_price_night}
                            hotel={hotel}
                            offerHourly={room.offer_hourly === true && room.hourly_rate != null}
                            hourlyRate={room.hourly_rate ?? null}
                            rating={rating?.average_rating ?? null}
                            reviewCount={rating?.review_count ?? 0}
                            maxGuests={room.capacity}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
