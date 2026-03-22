import { GoogleGenAI } from "@google/genai";
import { supabaseClient } from "../config/supabaseClient";

export type UserPrefsForAI = {
  budget_min: number | null;
  budget_max: number | null;
  amenities: unknown;
  travel_needs: string | null;
  hotel_preferences: string | null;
};

export type CatalogHotel = {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  currency: string | null;
  pets_policy: string | null;
  smoking_policy: string | null;
  rooms: Array<{
    name: string;
    room_type: string;
    base_price_night: number;
    offer_hourly: boolean;
    hourly_rate: number | null;
    capacity: number;
    amenities: string[];
  }>;
};

export type GeminiRankRow = {
  hotel_id: string;
  match_score: number;
  why: string;
  room_ideas?: string[];
};

export type GeminiRankResult = {
  summary: string;
  ranked: GeminiRankRow[];
};

function normalizeAmenities(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter(Boolean);
}

/** Load verified hotels with room summaries for the AI catalog (bounded size). */
export async function loadVerifiedHotelCatalog(maxHotels = 32): Promise<CatalogHotel[]> {
  const { data: hotels, error: hErr } = await supabaseClient
    .from("hotels")
    .select(
      "id, name, address, description, currency, pets_policy, smoking_policy"
    )
    .eq("verification_status", "verified")
    .limit(maxHotels * 2);

  if (hErr || !hotels?.length) return [];

  const hotelRows = hotels.slice(0, maxHotels) as Array<{
    id: string;
    name: string;
    address: string | null;
    description: string | null;
    currency: string | null;
    pets_policy: string | null;
    smoking_policy: string | null;
  }>;

  const ids = hotelRows.map((h) => h.id);
  const { data: roomsData } = await supabaseClient
    .from("rooms")
    .select(
      "hotel_id, name, room_type, base_price_night, offer_hourly, hourly_rate, capacity, amenities"
    )
    .in("hotel_id", ids);

  const byHotel = new Map<string, CatalogHotel["rooms"]>();
  for (const r of roomsData ?? []) {
    const row = r as {
      hotel_id: string;
      name: string;
      room_type: string;
      base_price_night: number | string;
      offer_hourly: boolean | null;
      hourly_rate: number | string | null;
      capacity: number;
      amenities: unknown;
    };
    const arr = byHotel.get(row.hotel_id) ?? [];
    if (arr.length >= 6) continue;
    arr.push({
      name: row.name,
      room_type: row.room_type,
      base_price_night: Number(row.base_price_night),
      offer_hourly: Boolean(row.offer_hourly),
      hourly_rate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
      capacity: row.capacity,
      amenities: normalizeAmenities(row.amenities),
    });
    byHotel.set(row.hotel_id, arr);
  }

  return hotelRows.map((h) => ({
    id: h.id,
    name: h.name,
    address: h.address ?? null,
    description: h.description ? h.description.slice(0, 400) : null,
    currency: h.currency ?? null,
    pets_policy: h.pets_policy ? h.pets_policy.slice(0, 200) : null,
    smoking_policy: h.smoking_policy ? h.smoking_policy.slice(0, 200) : null,
    rooms: byHotel.get(h.id) ?? [],
  }));
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const parsed = JSON.parse(body) as Record<string, unknown>;
  return parsed;
}

/**
 * Ask Gemini to rank hotels and explain matches. Requires GEMINI_API_KEY.
 */
export async function rankHotelsWithGemini(
  prefs: UserPrefsForAI,
  catalog: CatalogHotel[]
): Promise<GeminiRankResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      summary:
        "AI personalization is not configured. Set GEMINI_API_KEY on the server to enable smart picks.",
      ranked: [],
    };
  }

  const modelName =
    process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";

  const ai = new GoogleGenAI({ apiKey });

  const prefsPayload = {
    budget_min_php: prefs.budget_min,
    budget_max_php: prefs.budget_max,
    amenity_interests: normalizeAmenities(prefs.amenities),
    travel_needs: prefs.travel_needs,
    hotel_preferences: prefs.hotel_preferences,
  };

  const validIds = new Set(catalog.map((c) => c.id));

  const prompt = `You are a travel assistant for Marble Stay, a hotel booking platform focused on Romblon and the Philippines.

USER_PREFERENCES (JSON):
${JSON.stringify(prefsPayload, null, 2)}

VERIFIED_HOTELS_CATALOG (JSON array; each hotel has id UUID, rooms with prices in PHP):
${JSON.stringify(catalog, null, 2)}

Task:
1. Write a friendly 2–3 sentence "summary" addressed to the guest explaining what kinds of stays you prioritized based on their preferences (budget, interests, travel needs, hotel preferences).
2. Rank up to 12 hotels from the catalog that best fit the user. Only use hotel "id" values that appear exactly in the catalog. Prefer hotels whose rooms and policies match stated needs (family, quiet, pets, non-smoking, micro-stay/hourly, budget).
3. For each ranked hotel, give match_score (0–100), a short "why" (one sentence), and optional "room_ideas" (array of short strings suggesting room names or types).

Return ONLY valid JSON with this shape:
{
  "summary": string,
  "ranked_hotels": [
    {
      "hotel_id": string (UUID),
      "match_score": number,
      "why": string,
      "room_ideas": string[] (optional)
    }
  ]
}`;

  let text: string;
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.4,
        maxOutputTokens: 8192,
      },
    });
    text = response.text?.trim() ?? "";
  } catch {
    return {
      summary:
        "We could not reach the AI service right now. Try again later, or browse hotels from the home page.",
      ranked: [],
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJsonObject(text);
  } catch {
    return {
      summary:
        "We received an unexpected response from the AI. Try again, or browse hotels from the home page.",
      ranked: [],
    };
  }
  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "Here are stays that may suit your preferences.";
  const rawRanked = Array.isArray(parsed.ranked_hotels) ? parsed.ranked_hotels : [];
  const ranked: GeminiRankRow[] = [];
  for (const row of rawRanked) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const hotel_id = typeof o.hotel_id === "string" ? o.hotel_id.trim() : "";
    if (!hotel_id || !validIds.has(hotel_id)) continue;
    const match_score = Number(o.match_score);
    const why = typeof o.why === "string" ? o.why.trim() : "";
    const room_ideas = Array.isArray(o.room_ideas)
      ? o.room_ideas.map((x) => String(x)).filter(Boolean).slice(0, 4)
      : undefined;
    ranked.push({
      hotel_id,
      match_score: Number.isFinite(match_score) ? Math.min(100, Math.max(0, match_score)) : 50,
      why: why || "Matches your preferences.",
      room_ideas,
    });
  }

  ranked.sort((a, b) => b.match_score - a.match_score);

  return { summary, ranked };
}
