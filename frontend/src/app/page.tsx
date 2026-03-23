import { HeroSearch } from "@/components/landing/HeroSearch";
import { RecommendedHotels } from "@/components/landing/RecommendedHotels";
import { CtaSection } from "@/components/landing/CtaSection";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

async function fetchTopRated(): Promise<TopRatedHotel[]> {
  try {
    const res = await fetch(`${API_BASE}/api/hotels/top-rated`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function LandingPage() {
  const topRated = await fetchTopRated();

  return (
    <>
      <HeroSearch />
      <RecommendedHotels hotels={topRated} />
      <CtaSection />
    </>
  );
}
