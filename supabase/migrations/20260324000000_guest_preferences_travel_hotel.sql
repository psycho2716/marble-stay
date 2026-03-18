-- Guest preferences: travel needs and hotel preferences (free text)
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS travel_needs TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hotel_preferences TEXT DEFAULT NULL;

COMMENT ON COLUMN public.user_preferences.travel_needs IS 'Guest travel needs, e.g. business, leisure, accessibility, family. Free text.';
COMMENT ON COLUMN public.user_preferences.hotel_preferences IS 'What the guest prefers in a hotel, e.g. quiet, breakfast, pool, location. Free text.';
