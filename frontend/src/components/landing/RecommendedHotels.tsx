import Link from "next/link";
import { HotelCard } from "./HotelCard";

type TopRatedHotel = {
  id: string;
  name: string;
  address: string | null;
  images: string[] | null;
  profile_image_url?: string | null;
  average_rating: number | null;
  review_count: number;
  min_price?: string | null;
  currency?: string | null;
};

export function RecommendedHotels({ hotels }: { hotels: TopRatedHotel[] }) {
  return (
    <section className="px-4 py-14 md:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Recommended Hotels
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Handpicked escapes for your next journey.
            </p>
          </div>
          <Link
            href="/hotels"
            className="mt-2 inline-flex items-center text-sm font-medium text-primary hover:underline sm:mt-0"
          >
            View all
            <span className="ml-1" aria-hidden>→</span>
          </Link>
        </div>

        {hotels.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">
              No verified hotels with reviews yet. Check back soon or browse all stays.
            </p>
            <Link
              href="/hotels"
              className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Browse hotels
            </Link>
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {hotels.map((hotel) => (
              <li key={hotel.id}>
                <HotelCard
                  id={hotel.id}
                  name={hotel.name}
                  address={hotel.address}
                  imageUrl={hotel.profile_image_url ?? hotel.images?.[0] ?? null}
                  rating={hotel.average_rating}
                  reviewCount={hotel.review_count}
                  pricePerNight={hotel.min_price}
                  currency={hotel.currency ?? "PHP"}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
